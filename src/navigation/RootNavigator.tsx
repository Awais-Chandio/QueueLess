import React from "react";
import AuthNavigator from "./AuthNavigator";
import AppTabs from "./AppTabs";

const RootNavigator = () => {

        const isLoggedIn = false;

        return (


                isLoggedIn ? <AppTabs /> : <AuthNavigator />


        )
}
export default RootNavigator;