import { db } from "./firebase";
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore";
import type { Resource, Comment } from "../types";

// Add a story
export async function addStoryToDB(storyData: Resource) {
  const ref = collection(db, "stories");
  const docRef = await addDoc(ref, storyData);
  return docRef.id;
}

// Get all stories
export async function getAllStories() {
  const ref = collection(db, "stories");
  const snapshot = await getDocs(ref);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Resource[];
}

// Add a comment
export async function addCommentToDB(commentData: Comment) {
  const ref = collection(db, "comments");
  await addDoc(ref, commentData);
}

// Get all comments
export async function getAllComments() {
  const ref = collection(db, "comments");
  const snapshot = await getDocs(ref);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Comment[];
}
