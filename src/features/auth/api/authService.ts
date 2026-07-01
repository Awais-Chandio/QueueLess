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

    async signInWithOtp(phone: string) {
        return await supabase.auth.signInWithOtp({
            phone
        });
    },

    async verifyOtp(phone: string, token: string) {
        return await supabase.auth.verifyOtp({
            phone,
            token,
            type: 'sms'
        });
    },

    async signInWithGoogle() {
        return await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: 'queueless://auth/callback',
                skipBrowserRedirect: true,
            },
        });
    },

    async signUp(payload: SignupPayload) {
        const { name, email, password } = payload;
        return await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: name,
                    role: 'client'
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
    },

    async bridgeFirebaseUserToSupabase(uid: string, phoneNumber: string | null, displayName: string | null = null) {
        if (!phoneNumber) {
            throw new Error('Phone number is missing from Firebase credential.');
        }

        const email = `phone-${uid}@phone.queueless.com`;
        const password = `fb-phone-auth-${uid}-a1b2c3d4e5f6g7h8_queueless_phone_auth_salt`;

        if (__DEV__) {
            console.log('[authService] Bridging Firebase user to Supabase:', { uid, email, phoneNumber, displayName });
        }

        // STEP 5: 1. Search profile table: phone = firebaseUser.phoneNumber
        const { data: existingProfile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('phone', phoneNumber)
            .maybeSingle();

        if (profileError) {
            if (__DEV__) console.warn('[authService] Profile search error:', profileError);
        }

        let sessionData = null;
        let authError = null;

        if (existingProfile) {
            // If found: Sign user into app directly.
            if (__DEV__) console.log('[authService] Profile found by phone. Logging in to Supabase...');
            try {
                const signInRes = await supabase.auth.signInWithPassword({
                    email,
                    password
                });
                sessionData = signInRes.data;
                authError = signInRes.error;
            } catch (err: any) {
                authError = err;
            }
        }

        // If not found OR if sign in failed because auth account doesn't exist yet
        if (!existingProfile || (authError && (authError.message?.includes('Invalid login credentials') || authError.status === 400))) {
            if (__DEV__) console.log('[authService] Creating new Supabase user...', email);
            
            try {
                const signUpRes = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: displayName || phoneNumber,
                            role: 'client'
                        }
                    }
                });

                if (signUpRes.error) {
                    // Check if already registered
                    if (signUpRes.error.message?.includes('already registered') || signUpRes.error.status === 400) {
                        const retryRes = await supabase.auth.signInWithPassword({
                            email,
                            password
                        });
                        if (retryRes.error) throw retryRes.error;
                        sessionData = retryRes.data;
                        authError = null;
                    } else {
                        throw signUpRes.error;
                    }
                } else {
                    sessionData = signUpRes.data;
                    authError = null;
                }
            } catch (err: any) {
                throw err;
            }

            // STEP 5: 2. If profile does not exist: Insert (id = supabase uuid or firebase uid)
            // Note: RLS requires profile ID to match Supabase Auth user ID (auth.uid() = id).
            if (sessionData && sessionData.user) {
                const userId = sessionData.user.id;
                try {
                    const { data: checkProf } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', userId)
                        .maybeSingle();

                    if (!checkProf) {
                        if (__DEV__) console.log('[authService] Profile does not exist. Creating profile manually...');
                        const { error: insertErr } = await supabase
                            .from('profiles')
                            .insert({
                                id: userId,
                                phone: phoneNumber,
                                full_name: displayName || phoneNumber,
                                role: 'client',
                                auth_provider: 'phone',
                                created_at: new Date().toISOString(),
                                updated_at: new Date().toISOString()
                            } as any);
                        if (insertErr) throw insertErr;
                    } else {
                        // Update it
                        if (__DEV__) console.log('[authService] Updating existing profile for user...', userId);
                        await supabase
                            .from('profiles')
                            .update({
                                phone: phoneNumber,
                                full_name: displayName || checkProf.full_name || phoneNumber,
                                auth_provider: 'phone',
                                updated_at: new Date().toISOString()
                            } as any)
                            .eq('id', userId);
                    }
                } catch (profErr) {
                    if (__DEV__) console.warn('[authService] Error in profile sync:', profErr);
                }
            }
        } else if (authError) {
            throw authError;
        }

        return { data: sessionData, error: authError };
    }

}

