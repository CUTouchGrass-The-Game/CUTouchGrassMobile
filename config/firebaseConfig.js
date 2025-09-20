import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';

// Initialize Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCWLfqeVF1sjapMx3GMqY4CCQrKhttn5IQ",
    authDomain: "cutouchgrass.firebaseapp.com",
    projectId: "cutouchgrass",
    storageBucket: "cutouchgrass.firebasestorage.app",
    messagingSenderId: "288084940556",
    appId: "1:288084940556:web:acf90b0e60b5579c265b29",
    measurementId: "G-XCT5MJ7N39",
    databaseURL: "https://cutouchgrass-default-rtdb.firebaseio.com"
};

const firebaseApp = initializeApp(firebaseConfig);

export default firebaseApp;
// For more information on how to access Firebase in your project,
// see the Firebase documentation: https://firebase.google.com/docs/web/setup#access-firebase
