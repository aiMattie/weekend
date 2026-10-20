/** SDL part 1: scalars, enums and input types (Weekend API). */
export const baseSdl = /* GraphQL */ `
  scalar JSON
  scalar Date
  scalar ISO8601DateTime
  scalar CompareValue
  scalar File

  enum State { all active archived deleted }
  enum BoardKind { public private share }
  enum BoardsOrderBy { created_at used_at }
  enum WorkspacesOrderBy { created_at }
  enum WorkspaceKind { open closed }
  enum UserKind { all non_guests guests non_pending }
  enum BoardAttributes { communication description name }
  enum WorkspaceAttributeKind { name description kind }
  enum WorkspaceSubscriberKind { subscriber owner }
  enum BoardSubscriberKind { subscriber owner }
  enum DuplicateBoardType { duplicate_board_with_structure duplicate_board_with_pulses duplicate_board_with_pulses_and_updates }
  enum DuplicateGroupOrder { first last }
  enum PositionRelative { before_at after_at }
  enum ColumnProperty { title description }
  enum NotificationTargetType { Post Project }
  enum ItemsQueryOperator { and or }
  enum ItemsQueryRuleOperator {
    any_of not_any_of is_empty is_not_empty greater_than greater_than_or_equals lower_than lower_than_or_equal
    between not_contains_text contains_text contains_terms starts_with ends_with within_the_next within_the_last
  }
  enum ItemsOrderByDirection { asc desc }
  enum ColumnType {
    auto_number board_relation button checkbox color_picker country creation_log date dependency doc dropdown email
    file formula group hour integration item_assignees item_id last_updated link location long_text mirror name
    numbers people person phone progress rating status subtasks tags team text time_tracking timeline unsupported
    vote week world_clock sprint
  }
  enum WebhookEventType {
    change_column_value change_status_column_value change_subitem_column_value change_specific_column_value change_name
    create_item item_archived item_deleted item_moved_to_any_group item_moved_to_specific_group item_restored
    create_subitem change_subitem_name move_subitem subitem_archived subitem_deleted create_column create_update
    edit_update delete_update create_subitem_update
  }
  enum DocKind { private public share }

  input ItemsQueryRule {
    column_id: ID!
    compare_value: CompareValue!
    operator: ItemsQueryRuleOperator
    compare_attribute: String
  }
  input ItemsQueryOrderBy { column_id: String!, direction: ItemsOrderByDirection = asc }
  input ItemsQueryGroup { group_ids: [String!], column_id: String, active: Boolean }
  input ItemsQuery {
    ids: [ID!]
    operator: ItemsQueryOperator = and
    rules: [ItemsQueryRule!]
    order_by: [ItemsQueryOrderBy!]
    groups: [ItemsQueryGroup!]
  }
  input ItemsPageByColumnValuesQuery { column_id: String!, column_values: [String]! }
  input UpdateBoardHierarchyAttributesInput { folder_id: ID, workspace_id: ID }
  input CreateDocInput { workspace: CreateDocWorkspaceInput, board: CreateDocBoardInput }
  input CreateDocWorkspaceInput { workspace_id: ID!, name: String!, kind: BoardKind, folder_id: ID }
  input CreateDocBoardInput { item_id: ID!, column_id: String! }
  input UpdateWorkspaceAttributesInput { name: String, description: String, kind: WorkspaceKind }
  input UpdateFolderAttributes { name: String, color: String }
`;
