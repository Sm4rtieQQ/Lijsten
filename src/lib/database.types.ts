/**
 * Handgeschreven Supabase `Database` type — de enige plek waar de
 * tabelvormen worden gedeclareerd (zie AGENTS.md §7.2). Gedraagt zich als
 * de output van `supabase gen types`.
 *
 * Het uitnodigingssysteem (`invites`, `invite_claims`, `claim_invite`) is
 * verwijderd; registratie is nu open met e-mailbevestiging (§7.6).
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
