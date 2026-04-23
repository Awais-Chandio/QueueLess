import {create} from "zustand"
import { Session,User }  from "@supabase/supabase-js"

type AuthState = {
    session: Session | null;
    user:User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    setAuth: (session: Session | null, user: User | null, isAuthenticated: boolean,isLoading: boolean) => void;
    clearAuth: (session: Session | null, user: User | null, isAuthenticated: boolean,isLoading: boolean) => void;
    setLoading: (isLoading: boolean) => void;

}
export const useAuthStore = create<AuthState>((set)=>({
    session:null,
    user:null,
    isAuthenticated:false,
    isLoading:true,
    setAuth: (session: Session | null, user: User | null, isAuthenticated: boolean,isLoading: boolean) => set({ session, user, isAuthenticated, isLoading }),
    clearAuth: (session: Session | null, user: User | null, isAuthenticated: boolean,isLoading: boolean) => set({ session: null, user: null, isAuthenticated: false, isLoading: false }),
    setLoading: (isLoading: boolean) => set({ isLoading }),
}))
