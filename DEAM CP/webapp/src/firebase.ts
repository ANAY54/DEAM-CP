import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Matches the project used by the ESP32 firmware (see "arduino code.txt").
const firebaseConfig = {
  apiKey: "AIzaSyA3sfTXIn9i9ZPci84QDJrCHN0vsB6K12E",
  authDomain: "smartdoorbellsecurity.firebaseapp.com",
  projectId: "smartdoorbellsecurity",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
