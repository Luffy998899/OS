export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  title: string | null;
  department: string | null;
  points: number;
  status: string;
  roleName: string;
  permissions: string[];
};
