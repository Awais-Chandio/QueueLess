import {authService } from "../services/auth/authService"
import {useAuthStore} from "../store/authStore"
import {LoginPayload,SignupPayload} from "../types/auth"
 
export const useAuth = () => {
  const {
    session,
    user,
    isAuthenticated,
    isLoading,
    setAuth,
    clearAuth,
    setLoading
  }  = useAuthStore();

  return {
    session,
    user,
    isAuthenticated,
    isLoading,
    setAuth,
    clearAuth,
    setLoading
  }
}