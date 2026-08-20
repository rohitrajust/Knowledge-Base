export interface User {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
}

export interface Space {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  created_at: string;
}

export interface Membership {
  id: string;
  space_id: string;
  user_id: string;
  role: string;
  created_at: string;
  user: User;
}

export interface MeResponse {
  user: User;
  spaces: Space[];
}

export type ItemKind = "note" | "document" | "reference";

export interface Item {
  id: string;
  space_id: string;
  kind: ItemKind;
  title: string;
  body: string;
  url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Mirrors RelationType in apps/api/app/schemas/link.py. */
export type RelationType = "related" | "references" | "depends_on" | "supersedes" | "part_of";

/** Whether a relation points away from, toward, or neither, the item being viewed. */
export type RelationDirectionOut = "out" | "in" | "none";

export interface LinkedItem {
  link_id: string;
  created_at: string;
  relation: RelationType;
  direction_out: RelationDirectionOut;
  item: Item;
}

export interface GraphNode {
  id: string;
  title: string;
  kind: ItemKind;
}

export interface GraphEdge {
  id: string;
  /** The "from" end of the relation -- not necessarily canonical storage order. */
  source: string;
  target: string;
  relation: RelationType;
  /** False for `related`, whose endpoints are interchangeable; no arrowhead. */
  directed: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface SearchResult {
  item: Item;
  score: number;
}

export interface AskResponse {
  answer: string;
  sources: SearchResult[];
}

export interface MessageSource {
  item_id: string;
  title: string;
  kind: ItemKind;
  score: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: MessageSource[] | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  space_id: string;
  title: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
}

export interface MemorySummary {
  id: string;
  space_id: string;
  conversation_id: string | null;
  content: string;
  created_at: string;
  expires_at: string;
}
