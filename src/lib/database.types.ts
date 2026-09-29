/**
 * Handgeschreven Supabase `Database` type — de enige plek waar de
 * tabelvormen van `lists` en `list_items` worden gedeclareerd
 * (zie AGENTS.md §7.2). Gedraagt zich als de output van `supabase gen types`.
 */
export interface Database {
  public: {
    Tables: {
      lists: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          position?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      list_items: {
        Row: {
          id: string;
          list_id: string;
          text: string;
          done: boolean;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          list_id: string;
          text: string;
          done?: boolean;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          list_id?: string;
          text?: string;
          done?: boolean;
          position?: number;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type ListsRow = Database["public"]["Tables"]["lists"]["Row"];
export type ListItemsRow = Database["public"]["Tables"]["list_items"]["Row"];
