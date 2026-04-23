import { supabase } from "../supabase/client";
export const authService = {
    async getSession(){
        return await supabase.auth.getSession();
    },
    async SignOut(){
        return await supabase.auth.signOut();

    }
}