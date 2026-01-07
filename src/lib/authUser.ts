export interface AuthUser {
  id: string;
  username: string;
  role: string;
  full_name?: string | null;
  email?: string | null;
  otp_required?: boolean | null;
  can_view?: boolean | null;
  can_edit?: boolean | null;
  can_create?: boolean | null;
  can_delete?: boolean | null;
  can_export?: boolean | null;
  can_route?: boolean | null;
  can_team_view?: boolean | null;
  can_manual_gps?: boolean | null;
}
