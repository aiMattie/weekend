/** Executable schema: SDL parts + resolvers. */
import { makeExecutableSchema } from "@graphql-tools/schema";
import { GraphQLScalarType, Kind, printSchema, type GraphQLSchema, type ValueNode } from "graphql";
import { baseSdl } from "./sdl/base";
import { typesSdl } from "./sdl/types";
import { operationsSdl } from "./sdl/operations";
import * as objects from "./resolvers/objects";
import { Query } from "./resolvers/query";
import { itemMutations } from "./resolvers/mutation-items";
import { structureMutations } from "./resolvers/mutation-structure";
import { fileMutations } from "./resolvers/files";
import { ColumnValueInterface, columnValueResolvers } from "./resolvers/column-value-types";

function parseLiteral(ast: ValueNode, vars?: Record<string, unknown> | null): unknown {
  switch (ast.kind) {
    case Kind.STRING: case Kind.BOOLEAN: return ast.value;
    case Kind.INT: case Kind.FLOAT: return Number(ast.value);
    case Kind.NULL: return null;
    case Kind.LIST: return ast.values.map((v) => parseLiteral(v, vars));
    case Kind.OBJECT: return Object.fromEntries(ast.fields.map((f) => [f.name.value, parseLiteral(f.value, vars)]));
    case Kind.VARIABLE: return vars?.[ast.name.value];
    default: return undefined;
  }
}

const anyScalar = (name: string) => new GraphQLScalarType({ name, serialize: (v) => v, parseValue: (v) => v, parseLiteral });
const passthrough = (name: string) => new GraphQLScalarType({ name, serialize: (v) => v, parseValue: (v) => v, parseLiteral });

let cached: GraphQLSchema | null = null;

export function getSchema(): GraphQLSchema {
  if (cached) return cached;
  cached = makeExecutableSchema({
    typeDefs: [baseSdl, typesSdl, operationsSdl],
    resolvers: {
      JSON: anyScalar("JSON"),
      Date: passthrough("Date"),
      ISO8601DateTime: passthrough("ISO8601DateTime"),
      CompareValue: anyScalar("CompareValue"),
      File: passthrough("File"),
      Query,
      Mutation: { ...itemMutations, ...structureMutations, ...fileMutations },
      ColumnValue: ColumnValueInterface,
      ...columnValueResolvers,
      ...(objects as unknown as Record<string, never>),
    },
    resolverValidationOptions: { requireResolversToMatchSchema: "ignore" },
  });
  return cached;
}

export const schemaSdl = (): string => printSchema(getSchema());
