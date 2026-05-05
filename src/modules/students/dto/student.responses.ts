export interface GuardianView {
  user: {
    id: number;
    name: string;
    email: string;
    phone: string | null;
  };
  relation: string;
  is_primary: boolean;
  can_pickup: boolean;
}

export interface StudentView {
  id: number;
  name: string;
  gender: string;
  dob: string | null;
  join_date: string;
  status: string;
  daily_hifz_pages_capacity: string;
  daily_near_pages_capacity: string;
  daily_far_pages_capacity: string;
  notes: string | null;
  photo_url: string | null;
}

export interface StudentDetailView extends StudentView {
  guardians: GuardianView[];
}

export interface StudentListResult {
  items: StudentView[];
  total: number;
  page: number;
  limit: number;
}
