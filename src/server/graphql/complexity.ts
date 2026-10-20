/**
 * Query complexity + depth analysis (): every composite (object) field costs 1 per
 * instance, lists multiply by their `limit` argument (or `ids` length, default 25), and each
 * mutation field costs 10 on top. Scalars are free. Introspection is free.
 */
import {
  getNamedType, isCompositeType, isListType, getNullableType, Kind,
  type DocumentNode, type FragmentDefinitionNode, type GraphQLCompositeType, type GraphQLSchema, type SelectionSetNode, type ValueNode,
} from "graphql";

export interface Analysis { cost: number; depth: number }

type Vars = Record<string, unknown>;

function literal(node: ValueNode | undefined, vars: Vars): unknown {
  if (!node) return undefined;
  switch (node.kind) {
    case Kind.INT: return Number(node.value);
    case Kind.FLOAT: return Number(node.value);
    case Kind.VARIABLE: return vars[node.name.value];
    case Kind.LIST: return node.values.map((v) => literal(v, vars));
    case Kind.STRING: return node.value;
    default: return undefined;
  }
}

export const DEFAULT_LIST_SIZE = 25;

export function analyze(schema: GraphQLSchema, doc: DocumentNode, operationName: string | null | undefined, vars: Vars = {}): Analysis {
  const fragments = new Map<string, FragmentDefinitionNode>();
  const ops = [];
  for (const d of doc.definitions) {
    if (d.kind === Kind.FRAGMENT_DEFINITION) fragments.set(d.name.value, d);
    else if (d.kind === Kind.OPERATION_DEFINITION) ops.push(d);
  }
  const op = (operationName ? ops.find((o) => o.name?.value === operationName) : ops[0]) ?? ops[0];
  if (!op) return { cost: 0, depth: 0 };
  const root = op.operation === "mutation" ? schema.getMutationType() : op.operation === "subscription" ? schema.getSubscriptionType() : schema.getQueryType();
  if (!root) return { cost: 0, depth: 0 };
  let maxDepth = 0;

  const walk = (set: SelectionSetNode, parent: GraphQLCompositeType, mult: number, depth: number, visiting: Set<string>): number => {
    let total = 0;
    maxDepth = Math.max(maxDepth, depth);
    for (const sel of set.selections) {
      if (sel.kind === Kind.FRAGMENT_SPREAD) {
        const frag = fragments.get(sel.name.value);
        if (!frag || visiting.has(frag.name.value)) continue;
        const t = schema.getType(frag.typeCondition.name.value);
        if (t && isCompositeType(t)) total += walk(frag.selectionSet, t, mult, depth, new Set([...visiting, frag.name.value]));
        continue;
      }
      if (sel.kind === Kind.INLINE_FRAGMENT) {
        const t = sel.typeCondition ? schema.getType(sel.typeCondition.name.value) : parent;
        if (t && isCompositeType(t)) total += walk(sel.selectionSet, t, mult, depth, visiting);
        continue;
      }
      const name = sel.name.value;
      if (name.startsWith("__")) continue;
      const fields = "getFields" in parent ? (parent as { getFields(): Record<string, import("graphql").GraphQLField<unknown, unknown>> }).getFields() : {};
      const def = fields[name];
      if (!def) continue;
      const named = getNamedType(def.type);
      const composite = isCompositeType(named);
      let own = composite ? mult : 0;
      if (parent === schema.getMutationType()) own += 10;
      total += own;
      if (composite && sel.selectionSet) {
        let childMult = mult;
        if (parent.name === "ItemsResponse") {
          childMult = mult; // already multiplied by the page limit on items_page
        } else if (isListType(getNullableType(def.type))) {
          const args = Object.fromEntries((sel.arguments ?? []).map((a) => [a.name.value, literal(a.value, vars)]));
          const lim = typeof args.limit === "number" ? args.limit : Array.isArray(args.ids) ? args.ids.length : DEFAULT_LIST_SIZE;
          childMult = mult * Math.max(1, lim);
        } else if (name === "items_page" || name === "next_items_page" || name === "items_page_by_column_values") {
          const args = Object.fromEntries((sel.arguments ?? []).map((a) => [a.name.value, literal(a.value, vars)]));
          // the `items` list inside ItemsResponse is multiplied by the page limit
          childMult = mult * Math.max(1, typeof args.limit === "number" ? args.limit : DEFAULT_LIST_SIZE);
        }
        total += walk(sel.selectionSet, named as GraphQLCompositeType, childMult, depth + 1, visiting);
      }
    }
    return total;
  };
  const cost = walk(op.selectionSet, root, 1, 1, new Set());
  return { cost, depth: maxDepth };
}
