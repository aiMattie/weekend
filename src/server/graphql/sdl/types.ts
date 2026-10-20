/** SDL part 2: object types. */
export const typesSdl = /* GraphQL */ `
  type Complexity { query: Int!, before: Int!, after: Int!, reset_in_x_seconds: Int! }
  type Version { display_name: String!, kind: String!, value: String! }
  type Plan { tier: String, version: Int, period: String, max_users: Int }
  type Account { id: ID!, name: String!, slug: String!, plan: Plan, tier: String, show_timeline_weekends: Boolean!, users: [User] }

  type User {
    id: ID!
    name: String!
    email: String!
    title: String
    phone: String
    mobile_phone: String
    location: String
    photo_original: String
    photo_thumb: String
    photo_thumb_small: String
    photo_small: String
    time_zone_identifier: String
    current_language: String
    created_at: Date
    join_date: Date
    last_activity: Date
    enabled: Boolean!
    is_admin: Boolean
    is_guest: Boolean
    is_pending: Boolean
    is_view_only: Boolean
    is_verified: Boolean
    url: String
    teams: [Team]
    account: Account
  }
  type Team { id: ID!, name: String!, picture_url: String, is_guest: Boolean, users(emails: [String], ids: [ID!], kind: UserKind, limit: Int, name: String, newest_first: Boolean): [User], owners: [User!]! }

  type WorkspaceSettings { icon: JSON }
  type Workspace {
    id: ID
    name: String!
    kind: WorkspaceKind
    description: String
    state: State
    created_at: ISO8601DateTime
    is_default_workspace: Boolean
    account_product: JSON
    settings: WorkspaceSettings
    users_subscribers(limit: Int, page: Int): [User]
    owners_subscribers(limit: Int, page: Int): [User]
    teams_subscribers: [Team]
  }
  type Folder {
    id: ID!
    name: String!
    color: String
    created_at: Date
    owner_id: ID
    parent: Folder
    sub_folders: [Folder]
    children: [Board]
    workspace: Workspace
  }
  type Tag { id: ID!, name: String!, color: String }
  type BoardView { id: ID!, name: String!, type: String!, settings_str: String!, view_specific_data_str: String!, filter: JSON }
  type BoardPermissions { kind: BoardKind }
  type BoardDuplication { board: Board, is_async: Boolean }
  type ActivityLogType {
    id: String!
    account_id: String!
    created_at: String!
    data: String!
    entity: String!
    event: String!
    user_id: String!
  }
  type Board {
    id: ID!
    name: String!
    description: String
    state: State
    board_kind: BoardKind!
    board_folder_id: ID
    workspace_id: ID
    workspace: Workspace
    type: String
    permissions: String
    url: String
    creator: User
    owner: User!
    owners: [User]!
    subscribers: [User]!
    items_count: Int
    updated_at: ISO8601DateTime
    created_at: ISO8601DateTime
    top_group: Group!
    columns(ids: [String], types: [ColumnType!]): [Column]
    groups(ids: [String]): [Group]
    items_page(limit: Int = 25, cursor: String, query_params: ItemsQuery): ItemsResponse!
    tags: [Tag]
    views(ids: [ID!], type: String): [BoardView]
    updates(limit: Int = 25, page: Int = 1): [Update!]
    activity_logs(user_ids: [ID!], column_ids: [String], group_ids: [String], item_ids: [ID!], from: ISO8601DateTime, to: ISO8601DateTime, limit: Int, page: Int): [ActivityLogType]
  }
  type Group {
    id: ID!
    title: String!
    color: String!
    position: String
    archived: Boolean
    deleted: Boolean
    items_page(limit: Int = 25, cursor: String, query_params: ItemsQuery): ItemsResponse!
  }
  type Column {
    id: ID!
    title: String!
    type: ColumnType!
    description: String
    archived: Boolean
    settings_str: String!
    settings: JSON
    width: Int
  }
  type ItemsResponse { cursor: String, items: [Item!]! }
  type Item {
    id: ID!
    name: String!
    state: State
    url: String
    relative_link: String
    email: String
    created_at: Date
    updated_at: Date
    creator_id: String
    creator: User
    board: Board
    group: Group
    parent_item: Item
    subitems: [Item]
    column_values(ids: [String!], types: [ColumnType!]): [ColumnValue!]!
    assets(column_ids: [String]): [Asset]
    updates(limit: Int = 25, page: Int = 1, ids: [ID!]): [Update!]
    subscribers: [User]!
  }

  interface ColumnValue {
    id: ID!
    type: ColumnType!
    text: String
    value: JSON
    column: Column!
  }
  type StatusValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    label: String, index: Int, is_done: Boolean, label_style: StatusLabelStyle, update_id: ID, updated_at: Date
  }
  type StatusLabelStyle { color: String!, border: String! }
  type DateValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    date: String, time: String, icon: String, updated_at: Date
  }
  type PeopleEntity { id: ID!, kind: String }
  type PeopleValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    persons_and_teams: [PeopleEntity!], updated_at: Date
  }
  type NumbersValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    number: Float, symbol: String, direction: String
  }
  type TextValue implements ColumnValue { id: ID!, type: ColumnType!, text: String, value: JSON, column: Column! }
  type LongTextValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    updated_at: Date
  }
  type CheckboxValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    checked: Boolean, updated_at: Date
  }
  type DropdownOption { id: Int, label: String! }
  type DropdownValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    values: [DropdownOption!]!
  }
  type LinkValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    url: String, url_text: String, updated_at: Date
  }
  type TimelineValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    from: Date, to: Date, visualization_type: String, updated_at: Date
  }
  type BoardRelationValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    display_value: String!, linked_item_ids: [ID!]!, linked_items: [Item!]!, linked_board_ids: [ID!]!
  }
  type MirrorValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    display_value: String!, mirrored_items: [JSON!]!
  }
  type FormulaValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    display_value: String!
  }
  type ProgressValue implements ColumnValue { id: ID!, type: ColumnType!, text: String, value: JSON, column: Column! }
  type FileValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    files: [JSON!]!
  }
  type TagsValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    tag_ids: [Int!]!, tags: [Tag!]!
  }
  type RatingValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    rating: Int, updated_at: Date
  }
  type EmailValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    email: String, label: String, updated_at: Date
  }
  type PhoneValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    phone: String, country_short_name: String, updated_at: Date
  }
  type WeekValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    start_date: Date, end_date: Date, updated_at: Date
  }
  type ItemIdValue implements ColumnValue { id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!, item_id: ID! }
  type CreationLogValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    created_at: Date!, creator_id: ID
  }
  type LastUpdatedValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    updated_at: Date, updater_id: ID
  }
  type SubtasksValue implements ColumnValue {
    id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!
    subitems_ids: [ID!]!
  }
  type ButtonValue implements ColumnValue { id: ID!, type: ColumnType!, text: String, value: JSON, column: Column!, label: String, color: String }
  type GenericColumnValue implements ColumnValue { id: ID!, type: ColumnType!, text: String, value: JSON, column: Column! }

  type Reply { id: ID!, body: String!, text_body: String, created_at: Date, updated_at: Date, creator_id: String, creator: User }
  type Like { id: ID!, creator_id: String, creator: User, reaction_type: String, created_at: Date, updated_at: Date }
  type Update {
    id: ID!
    body: String!
    text_body: String
    created_at: Date
    updated_at: Date
    edited_at: Date
    creator_id: String
    creator: User
    item_id: String
    item: Item
    replies: [Reply!]
    likes: [Like!]!
    assets: [Asset]
    pinned_to_top: [JSON!]
  }
  type Asset {
    id: ID!
    name: String!
    url: String!
    public_url: String!
    file_extension: String!
    file_size: Int!
    created_at: Date
    uploaded_by: User!
    original_geometry: String
  }
  type Webhook { id: ID!, board_id: ID!, event: WebhookEventType!, config: String }
  type Notification { id: ID, text: String }
  type Document {
    id: ID!
    object_id: ID!
    name: String!
    doc_kind: DocKind!
    workspace_id: ID
    doc_folder_id: ID
    created_by: User
    created_at: Date
    url: String
    relative_url: String
    settings: JSON
  }
`;
