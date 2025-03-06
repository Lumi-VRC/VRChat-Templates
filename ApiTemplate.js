//A template for using a vrchat account to access VRChat's API!
//This node.js command line program uses a VRChat account supplied in a .json file to access and log into VRChat's API, returning various debug strings and (hopefully!) the accounts username.
//@lumi_vrc on Discord
//Much of the credit goes to the amazing community that inspired this program!
//Code's mine though, though I had plenty of help. :3

/*
npm install vrchat
npm install node-2fa
npm install throttled-queue
npm install axios-cookiejar-support@latest
*/

/* config.json example, which should be located in a folder called Config in this programs home dir3ectory.
   Replace the three fields. "Twofa" must be obtained from the qr code, not the 'show code' option. Just take it from the link it gives you. It will look like this:
   otpauth://totp/VRChat:(email)?secret=={TWOFA_CODE_HERE}&issuer=VRChat
   
{
  "VRChat": {
    "user": "vrchat_account_username",
    "pass": "vrchat_account_password",
    "twofa": "Get_This_Base64_Key_From_The_!!QRCode!!_On_VRChats_Website_Using_Your_Phone"
  }
}

*/

//This library simplifies interactions with VRChat's API
const vrchat = require("vrchat");                   
//This library allows us to generate OTP's dynamically, which is needed for service accounts to run by themselves.
const twofactor = require("node-2fa");           
//This allows us to not get rate-limited by the api while simultaneously implementing a queue system.
const throttledQueue = require("throttled-queue");    

// Throttle to 1 request per minute
const throttle = throttledQueue(1, 60000, true);

// Load config (adjust the path as needed)
// This file contains verification service account credentials, 2fa secret (obtained directly from QR code) after enabling 2FA, etc.
// You could also store them as environmental variables, but in a testing environment I just found this simpler.
const config = require("./config/config.json");

console.log("Starting test.js...");
console.log("Loaded config:", config);


// Generate a fresh token each time you attempt login
function generateOtpToken() {
    console.log("Generating OTP token using secret from config...");
    const tokenObj = twofactor.generateToken(config.VRChat.twofa); //'twofa' is the code obtained from the QR code. It is what apps like Authy use to generate codes themselves.
    if (!tokenObj || !tokenObj.token) {
        throw new Error("Failed to generate OTP token");
    }
    console.log("Generated OTP token:", tokenObj.token);
    return tokenObj.token;
}

// Configure the VRChat API with URL encoding for credentials
// It gets tiring typing all of this over and over again..
// Mainly just to future-proof for round-robin systems, as previously mentioned in the config.json import line.
// All this does is allow you to load the username/password/header of each service account.
let userAgent = `APITester/1.0.0 example@gmail.com`;
const configuration = new vrchat.Configuration({
    username: encodeURIComponent(config.VRChat.user),
    password: encodeURIComponent(config.VRChat.pass),
    baseOptions: {
        headers: {
            "User-Agent": userAgent
        }
    }
});

console.log("VRChat API configuration created with userAgent:", userAgent);

// Create API instances
// These are essentially just the 'pretty pink bow' I'm wrapping the API requests in, makes it organized.
// Think of them as boxes that you put functions in to hand to the rest of your program instead of typing it all out.
// Very similar to 'class' or 'struct' in C++!
// Thanks to VRChat's library that we imported, many api requests have been simplified to simple functions we can call. <3
const AuthenticationApi = new vrchat.AuthenticationApi(configuration);
const UsersApi = new vrchat.UsersApi(configuration);

let currentUser; // Will store the users username. Used to just verify login is successful at time of writing, will most likely see further functionality. (I will probably forget to update this comment. oops.)

console.log("Starting throttled queue for API calls...");
// Use the throttled queue for making API calls
throttle(() => {
    console.log("Calling AuthenticationApi.getCurrentUser()...");
    AuthenticationApi.getCurrentUser() //Remember the API instances I mentioned? Here's one being used.
        .then(resp => {
            console.log("Received response from getCurrentUser():", resp.data);
            // If the bots information is retrieved sucessfully, print the displayname!
            // Note: the 'getCurrentUser' function both serves as a way to retrieve user info, but !!ALSO TO LOG IN!!
            console.log("Current displayName:", resp.data.displayName);
            // If displayName is missing, it means 2FA is likely required. After all, if no data loads, it won't be there.
            if (!resp.data.displayName) {
                console.log("2FA required. Generating OTP and verifying..."); //self-explanatory
                const otpCode = generateOtpToken();
                console.log("Attempting 2FA verification with OTP code:", otpCode);
                AuthenticationApi.verify2FA({ code: otpCode })
                    .then(resp => {
                        console.log(`2FA verified: ${resp.data.verified}`); //yay!
                    })
                    .then(() => {
                        console.log("Retrying getCurrentUser() after 2FA verification...");
                        // Retry getting the current user after verifying 2FA
                        AuthenticationApi.getCurrentUser().then(resp => {
                            currentUser = resp.data;
                            console.log("Logged in as:", currentUser.displayName); //Display username in console. mainly used while testing script to show it worked.
                            // Retrieve the authentication token for further calls
                        });
                    })
                    .catch(error => { //not yay.
                        console.error("2FA verification failed:", error.response ? error.response.data : error.message);
                    });
            } else {
                console.log("No 2FA required; already logged in.");
            }
        })
        .catch(error => {
            console.error("Error getting current user:", error.response ? error.response.data : error.message);
        });
});
console.log("Throttled queue call scheduled.");
//Done!
