/** SDL part 3: Query and Mutation roots. */
export const operationsSdl = /* GraphQL */ `
  type Query {
    me: User
    account: Account
    users(ids: [ID!], emails: [String], kind: UserKind, name: String, newest_first: Boolean, limit: Int, page: Int): [User]
    teams(ids: [ID!]): [Team]
    workspaces(ids: [ID!], kind: WorkspaceKind, state: State, limit: Int = 25, page: Int = 1, order_by: WorkspacesOrderBy): [Workspace]
    folders(ids: [ID!], workspace_ids: [ID], limit: Int = 25, page: Int = 1): [Folder]
    boards(ids: [ID!], workspace_ids: [ID], state: State = active, board_kind: BoardKind, order_by: BoardsOrderBy, limit: Int = 25, page: Int = 1, newest_first: Boolean): [Board]
    items(ids: [ID!], limit: Int = 25, page: Int = 1, newest_first: Boolean, exclude_nonactive: Boolean): [Item]
    items_page_by_column_values(board_id: ID!, columns: [ItemsPageByColumnValuesQuery!], limit: Int = 25, cursor: String): ItemsResponse!
    next_items_page(limit: Int = 25, cursor: String!): ItemsResponse!
    updates(ids: [ID!], limit: Int = 25, page: Int = 1, from_date: String, to_date: String): [Update!]
    assets(ids: [ID!]!): [Asset]
    docs(ids: [ID!], object_ids: [ID!], workspace_ids: [ID], limit: Int = 25, page: Int = 1, order_by: BoardsOrderBy): [Document]
    webhooks(board_id: ID!, app_webhooks_only: Boolean): [Webhook]
    tags(ids: [ID!]): [Tag]
    complexity: Complexity
    version: Version!
    versions: [Version!]!
  }

  type Mutation {
    create_board(board_name: String!, board_kind: BoardKind!, description: String, workspace_id: ID, folder_id: ID, template_id: ID, board_owner_ids: [ID!], board_subscriber_ids: [ID!], empty: Boolean): Board
    duplicate_board(board_id: ID!, duplicate_type: DuplicateBoardType!, board_name: String, workspace_id: ID, folder_id: ID, keep_subscribers: Boolean): BoardDuplication
    update_board(board_id: ID!, board_attribute: BoardAttributes!, new_value: String!): JSON
    archive_board(board_id: ID!): Board
    delete_board(board_id: ID!): Board
    update_board_hierarchy(board_id: ID!, attributes: UpdateBoardHierarchyAttributesInput!): JSON
    add_users_to_board(board_id: ID!, user_ids: [ID!]!, kind: BoardSubscriberKind): [User]
    delete_subscribers_from_board(board_id: ID!, user_ids: [ID!]!): [User]

    create_group(board_id: ID!, group_name: String!, group_color: String, relative_to: String, position_relative_method: PositionRelative, position: String): Group
    update_group(board_id: ID!, group_id: String!, group_attribute: String, new_value: String): Group
    duplicate_group(board_id: ID!, group_id: String!, add_to_top: Boolean, group_title: String): Group
    archive_group(board_id: ID!, group_id: String!): Group
    delete_group(board_id: ID!, group_id: String!): Group

    create_column(board_id: ID!, id: String, title: String!, description: String, column_type: ColumnType!, defaults: JSON, after_column_id: ID): Column
    create_status_column(board_id: ID!, id: String, title: String!, description: String, defaults: JSON, after_column_id: ID): Column
    create_dropdown_column(board_id: ID!, id: String, title: String!, description: String, defaults: JSON, after_column_id: ID): Column
    update_status_column(board_id: ID!, id: String!, title: String, description: String, defaults: JSON, revision: String): Column
    update_dropdown_column(board_id: ID!, id: String!, title: String, description: String, defaults: JSON, revision: String): Column
    change_column_title(board_id: ID!, column_id: String!, title: String!): Column
    change_column_metadata(board_id: ID!, column_id: String!, column_property: ColumnProperty, value: String): Column
    delete_column(board_id: ID!, column_id: String!): Column

    create_item(board_id: ID!, group_id: String, item_name: String!, column_values: JSON, create_labels_if_missing: Boolean, position_relative_method: PositionRelative, relative_to: ID): Item
    create_subitem(parent_item_id: ID!, item_name: String!, column_values: JSON, create_labels_if_missing: Boolean): Item
    change_column_value(board_id: ID!, item_id: ID, column_id: String!, value: JSON!, create_labels_if_missing: Boolean): Item
    change_simple_column_value(board_id: ID!, item_id: ID, column_id: String!, value: String, create_labels_if_missing: Boolean): Item
    change_multiple_column_values(board_id: ID!, item_id: ID, column_values: JSON!, create_labels_if_missing: Boolean): Item
    move_item_to_group(item_id: ID, group_id: String!): Item
    move_item_to_board(board_id: ID!, group_id: ID!, item_id: ID!, columns_mapping: [JSON!], subitems_columns_mapping: [JSON!]): Item
    duplicate_item(board_id: ID!, item_id: ID, with_updates: Boolean): Item
    archive_item(item_id: ID): Item
    delete_item(item_id: ID): Item
    clear_item_updates(item_id: ID!): Item

    create_update(item_id: ID, parent_id: ID, body: String!): Update
    edit_update(id: ID!, body: String!): Update
    delete_update(id: ID!): Update
    like_update(update_id: ID!, reaction_type: String): Update
    unlike_update(update_id: ID!): Update
    pin_to_top(id: ID!, item_id: ID): Update
    unpin_from_top(id: ID!, item_id: ID): Update

    create_workspace(name: String!, kind: WorkspaceKind!, description: String): Workspace
    update_workspace(id: ID, attributes: UpdateWorkspaceAttributesInput!): Workspace
    delete_workspace(workspace_id: ID!): Workspace
    add_users_to_workspace(workspace_id: ID!, user_ids: [ID!]!, kind: WorkspaceSubscriberKind!): [User]
    delete_users_from_workspace(workspace_id: ID!, user_ids: [ID!]!): [User]
    create_folder(workspace_id: ID, name: String!, color: String, parent_folder_id: ID): Folder
    update_folder(folder_id: ID!, name: String, color: String): Folder
    delete_folder(folder_id: ID!): Folder

    create_webhook(board_id: ID!, url: String!, event: WebhookEventType!, config: JSON): Webhook
    delete_webhook(id: ID!): Webhook
    create_notification(user_id: ID!, target_id: ID!, text: String!, target_type: NotificationTargetType!): Notification
    create_doc(location: CreateDocInput!): Document
    add_file_to_column(item_id: ID, column_id: String!, file: File!): Asset
    add_file_to_update(update_id: ID!, file: File!): Asset
    create_or_get_tag(tag_name: String, board_id: ID): Tag
  }
`;
