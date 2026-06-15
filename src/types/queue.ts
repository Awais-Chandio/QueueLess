export interface QueueUpdate {
    id: string;
    appointment_id: string;
    current_position: number;
    people_ahead: number;
    estimated_wait_mins: number;
    status: string;
    created_at: string;
}