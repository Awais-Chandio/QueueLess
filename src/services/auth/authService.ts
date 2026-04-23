import { LoginPayload, SignupPayload } from "../../types/auth";
import { supabase } from "../supabase/client";
export const authService = {
    async getSession(){
        return await supabase.auth.getSession();
    },

    async signIn(payload:LoginPayload){
        const {email,password} = payload;
        return await supabase.auth.signInWithPassword({
            email,
            password
        });
    },
    async signUp(payload:SignupPayload){
        const {name,email,password} = payload;
        return await supabase.auth.signUp({
            email,
            password,
            options:{
                data:{
                   full_name: name
                }          }
            });
    },

    async signOut(){
        return await supabase.auth.signOut();

    }
}