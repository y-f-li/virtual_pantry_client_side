export interface User {
  id: number | null;
  username: string | null;
  status: string | null;
  bio?: string | null;
  creation_date?: string | null;
  token?: string | null;
}