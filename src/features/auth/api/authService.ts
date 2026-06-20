import { LoginPayload, SignupPayload } from "../../../types/auth";
import { supabase } from "../../../lib/supabase";

export const PASSWORD_RESET_REDIRECT_URL = 'queueless://reset-password';

export const authService = {
    async getSession() {
        return await supabase.auth.getSession();
    },

    async signIn(payload: LoginPayload) {
        const { email, password } = payload;
        return await supabase.auth.signInWithPassword({
            email,
            password
        });
    },
    async signUp(payload: SignupPayload) {
        const { name, email, password } = payload;
        return await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: name
                }
            }
        });
    },

    async signOut() {
        return await supabase.auth.signOut();

    },

    async sendPasswordResetEmail(email: string) {
        return await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: PASSWORD_RESET_REDIRECT_URL,
        });
    },

    async exchangeCodeForSession(code: string) {
        return await supabase.auth.exchangeCodeForSession(code);
    },

    async setRecoverySession(accessToken: string, refreshToken: string) {
        return await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
        });
    },

    async updatePassword(password: string) {
        return await supabase.auth.updateUser({
            password,
        });
    }
}
