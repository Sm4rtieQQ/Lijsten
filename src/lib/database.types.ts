/**
 * Handgeschreven Supabase `Database` type — de enige plek waar de
 * tabelvormen worden gedeclareerd (zie AGENTS.md §7.2). Gedraagt zich als
 * de output van `supabase gen types`.
 *
 * `invites` en `invite_claims` staan erin omdat de RPC `claim_invite` ze
 * raakt. De app heeft daarover GEEN rechten: RLS staat aan, er zijn geen
 * policies en de grants zijn ingetrokken. Dit zijn types, geen toegang.
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
      // Beheertabellen uit supabase-invites.sql. Nooit rechtstreeks queryen
      // vanuit de app; alleen via de RPC `claim_invite`.
      invites: {
        Row: {
          id: string;
          token: string;
          email: string;
          note: string | null;
          created_at: string;
          expires_at: string;
          used_at: string | null;
          used_by: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      invite_claims: {
        Row: {
          token: string;
          claimed_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      /**
       * Roept een uitnodiging op. Geeft `valid = false` terug zonder fout bij een
       * onbekend, gebruikt of verlopen token. Bij `valid = true` bevat `email` het
       * adres uit de uitnodiging: dat is het enige adres waarmee je kunt
       * registreren (de trigger op auth.users controleert dat).
       */
      claim_invite: {
        Args: { in_token: string };
        Returns: {
          valid: boolean;
          email: string | null;
          expires_at: string | null;
        };
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type ListsRow = Database["public"]["Tables"]["lists"]["Row"];
export type ListItemsRow = Database["public"]["Tables"]["list_items"]["Row"];
export type ClaimInviteResult =
  Database["public"]["Functions"]["claim_invite"]["Returns"];
