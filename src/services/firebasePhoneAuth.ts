import { getAuth, signInWithPhoneNumber, signOut, FirebaseAuthTypes } from '@react-native-firebase/auth';

let confirmationResult: FirebaseAuthTypes.ConfirmationResult | null = null;

export const firebasePhoneAuth = {
    async sendOTP(phoneNumber: string): Promise<boolean> {
        try {
            if (__DEV__) {
                console.log('[firebasePhoneAuth] sendOTP started for:', phoneNumber);
            }
            const confirmation = await signInWithPhoneNumber(getAuth(), phoneNumber);
            confirmationResult = confirmation as any;
            return true;
        } catch (error: any) {
            if (__DEV__) {
                console.error('[firebasePhoneAuth] Error in sendOTP:', error);
            }
            throw new Error(this.getReadableErrorMessage(error));
        }
    },

    async verifyOTP(code: string): Promise<FirebaseAuthTypes.UserCredential> {
        try {
            if (__DEV__) {
                console.log('[firebasePhoneAuth] verifyOTP started with code:', code);
            }
            if (!confirmationResult) {
                throw new Error('No active verification session. Please request a new OTP.');
            }
            const userCredential = await confirmationResult.confirm(code);
            if (!userCredential) {
                throw new Error('Verification failed. No credentials returned.');
            }
            return userCredential;
        } catch (error: any) {
            if (__DEV__) {
                console.error('[firebasePhoneAuth] Error in verifyOTP:', error);
            }
            throw new Error(this.getReadableErrorMessage(error));
        }
    },

    async logoutFirebase(): Promise<void> {
        try {
            const firebaseAuth = getAuth();
            if (firebaseAuth.currentUser) {
                await signOut(firebaseAuth);
            }
            confirmationResult = null;
            if (__DEV__) {
                console.log('[firebasePhoneAuth] Signed out from Firebase.');
            }
        } catch (error: any) {
            if (__DEV__ && error?.code !== 'auth/no-current-user') {
                console.warn('[firebasePhoneAuth] Logout info:', error?.message || error);
            }
        }
    },

    getReadableErrorMessage(error: any): string {
        if (!error || !error.code) {
            return error?.message || 'An unknown error occurred during authentication.';
        }

        switch (error.code) {
            case 'auth/invalid-phone-number':
                return 'The phone number entered is invalid. Please check and try again.';
            case 'auth/missing-phone-number':
                return 'Phone number is required.';
            case 'auth/quota-exceeded':
                return 'SMS quota exceeded. Please try again later.';
            case 'auth/too-many-requests':
                return 'Too many login attempts. Please wait a few minutes and try again.';
            case 'auth/session-expired':
                return 'The verification code has expired. Please request a new OTP.';
            case 'auth/invalid-verification-code':
                return 'The verification code you entered is invalid. Please try again.';
            case 'auth/network-request-failed':
                return 'A network error occurred. Please check your internet connection.';
            default:
                return error.message || 'An error occurred. Please try again.';
        }
    }
};
