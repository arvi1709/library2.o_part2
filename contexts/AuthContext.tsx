import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useMemo } from 'react';
import { 
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, doc, setDoc, updateDoc, getDoc 
} from "firebase/firestore";
import { db, auth } from "../services/firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import type { User, Resource, Comment, Report, EmpathyRating } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  stories: Resource[];
  comments: Comment[];
  likes: Record<string, string[]>;
  reports: Report[];
  bookmarks: string[];
  empathyRatings: Record<string, EmpathyRating[]>;
  login: (email: string, pass: string) => Promise<any>;
  logout: () => Promise<void>;
  signup: (email: string, pass: string) => Promise<any>;
  addStory: (storyData: Pick<Resource, 'title' | 'category' | 'shortDescription' | 'content' | 'summary' | 'tags' | 'fileName'>) => Promise<void>;
  updateStory: (storyId: string, updates: Partial<Omit<Resource, 'id'>>) => void;
  addComment: (resourceId: string, text: string) => Promise<void>;
  toggleLike: (resourceId: string) => Promise<void>;
  reportContent: (resourceId: string, resourceTitle: string) => Promise<void>;
  updateUserProfile: (name: string, imageFile: File | null) => Promise<void>;
  toggleBookmark: (resourceId: string) => Promise<void>;
  rateEmpathy: (resourceId: string, rating: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [stories, setStories] = useState<Resource[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [likes, setLikes] = useState<Record<string, string[]>>({});
  const [reports, setReports] = useState<Report[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [empathyRatings, setEmpathyRatings] = useState<Record<string, EmpathyRating[]>>({});

  // 🔐 Handle Authentication State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const storedProfile = localStorage.getItem(`profile_${user.uid}`);
        let name = user.displayName || user.email?.split('@')[0] || 'User';
        let imageUrl = `https://picsum.photos/seed/${user.uid}/200/200`;

        if (storedProfile) {
          try {
            const customProfile = JSON.parse(storedProfile);
            name = customProfile.name || name;
            imageUrl = customProfile.imageUrl || imageUrl;
          } catch (e) {
            console.error("Failed to parse stored profile", e);
          }
        }

        setCurrentUser({ uid: user.uid, email: user.email, name, imageUrl });

        // 🔁 Sync bookmarks from Firestore
        const userDocRef = doc(db, "users", user.uid);
        const snap = await getDoc(userDocRef);
        if (snap.exists()) {
          const data = snap.data();
          setBookmarks(data.bookmarks || []);
        } else {
          await setDoc(userDocRef, { bookmarks: [] });
          setBookmarks([]);
        }
      } else {
        setCurrentUser(null);
        setBookmarks([]);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // 🔁 Real-time sync for all collections
  useEffect(() => {
    const unsubStories = onSnapshot(query(collection(db, "stories"), orderBy("createdAt", "desc")), (snapshot) => {
      const storyList: Resource[] = snapshot.docs.map(doc => ({
        ...(doc.data() as Resource),
        id: doc.id
      }));
      setStories(storyList);
    });

    const unsubComments = onSnapshot(collection(db, "comments"), (snapshot) => {
      const commentList: Comment[] = snapshot.docs.map(doc => doc.data() as Comment);
      setComments(commentList);
    });

    const unsubLikes = onSnapshot(collection(db, "likes"), (snapshot) => {
      const likeMap: Record<string, string[]> = {};
      snapshot.docs.forEach(doc => {
        likeMap[doc.id] = doc.data().userIds || [];
      });
      setLikes(likeMap);
    });

    const unsubReports = onSnapshot(collection(db, "reports"), (snapshot) => {
      const reportList: Report[] = snapshot.docs.map(doc => doc.data() as Report);
      setReports(reportList);
    });

    const unsubEmpathy = onSnapshot(collection(db, "empathyRatings"), (snapshot) => {
      const map: Record<string, EmpathyRating[]> = {};
      snapshot.docs.forEach(doc => {
        map[doc.id] = doc.data().ratings || [];
      });
      setEmpathyRatings(map);
    });

    return () => {
      unsubStories();
      unsubComments();
      unsubLikes();
      unsubReports();
      unsubEmpathy();
    };
  }, []);

  // 🔧 Auth Actions
  const login = useCallback((email: string, password: string) => signInWithEmailAndPassword(auth, email, password), []);
  const signup = useCallback((email: string, password: string) => createUserWithEmailAndPassword(auth, email, password), []);
  const logout = useCallback(() => signOut(auth), []);

  // 📝 Add a story
  const addStory = useCallback(async (storyData: Pick<Resource, 'title' | 'category' | 'shortDescription' | 'content' | 'summary' | 'tags' | 'fileName'>) => {
    if (!currentUser) throw new Error("User not authenticated");

    const newStory = {
      ...storyData,
      authorId: currentUser.uid,
      authorName: currentUser.name,
      imageUrl: `https://picsum.photos/seed/${Date.now()}/400/300`,
      status: "pending_review",
      createdAt: serverTimestamp(),
    };
    await addDoc(collection(db, "stories"), newStory);
  }, [currentUser]);

  // ✏️ Update a story locally (for UI sync)
  const updateStory = useCallback((storyId: string, updates: Partial<Omit<Resource, 'id'>>) => {
    setStories(prev => prev.map(s => s.id === storyId ? { ...s, ...updates } : s));
  }, []);

  // 💬 Add comment
  const addComment = useCallback(async (resourceId: string, text: string) => {
    const user = auth.currentUser;
    if (!user || !currentUser) {
      console.error("User must be logged in to comment.");
      return;
    }
    const newComment: Comment = {
      id: `comment-${Date.now()}`,
      resourceId,
      authorId: currentUser.uid,
      authorName: currentUser.name ?? user.displayName ?? user.email?.split('@')[0] ?? 'Anonymous',
      authorImageUrl: currentUser.imageUrl,
      text,
      timestamp: Date.now(),
    };
    await addDoc(collection(db, "comments"), newComment);
  }, [currentUser]);

  // ❤️ Toggle like
  const toggleLike = useCallback(async (resourceId: string) => {
    if (!currentUser) return;
    const likeRef = doc(db, "likes", resourceId);
    const snap = await getDoc(likeRef);
    if (snap.exists()) {
      const data = snap.data();
      const updated = data.userIds.includes(currentUser.uid)
        ? data.userIds.filter((id: string) => id !== currentUser.uid)
        : [...data.userIds, currentUser.uid];
      await updateDoc(likeRef, { userIds: updated });
    } else {
      await setDoc(likeRef, { userIds: [currentUser.uid] });
    }
  }, [currentUser]);

  // 🚩 Report content
  const reportContent = useCallback(async (resourceId: string, resourceTitle: string) => {
    if (!currentUser) return;
    const report = { resourceId, reporterId: currentUser.uid, resourceTitle, timestamp: Date.now() };
    await addDoc(collection(db, "reports"), report);
  }, [currentUser]);

  // 🔖 Toggle bookmark (stored per-user)
  const toggleBookmark = useCallback(async (resourceId: string) => {
    if (!currentUser) return;
    const userRef = doc(db, "users", currentUser.uid);
    const snap = await getDoc(userRef);
    const userData = snap.exists() ? snap.data() : { bookmarks: [] };
    const updated = userData.bookmarks.includes(resourceId)
      ? userData.bookmarks.filter((id: string) => id !== resourceId)
      : [...userData.bookmarks, resourceId];
    await setDoc(userRef, { bookmarks: updated }, { merge: true });
    setBookmarks(updated);
  }, [currentUser]);

  // 💖 Empathy rating
  const rateEmpathy = useCallback(async(resourceId: string, rating: number) => {
      if (!currentUser || rating < 0 || rating > 100) return;
      
      setEmpathyRatings(prev => {
        const newRatings = { ...prev };
        let currentRatings = newRatings[resourceId] || [];
        const userRatingIndex = currentRatings.findIndex(r => r.userId === currentUser.uid);

        if (userRatingIndex > -1) {
          currentRatings[userRatingIndex].rating = rating;
        } else {
          currentRatings.push({ userId: currentUser.uid, rating });
        }
        
        newRatings[resourceId] = [...currentRatings];
        return newRatings;
      });
    }, [currentUser]);
  // 🧑‍🎨 Update user profile
  const updateUserProfile = useCallback(async (name: string, imageFile: File | null) => {
    const user = auth.currentUser;
    if (!user || !currentUser) throw new Error("User not authenticated");

    let newImageUrl = currentUser.imageUrl;
    if (imageFile) {
      newImageUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(imageFile);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
    }

    await updateProfile(user, { displayName: name });
    const updatedUser = { ...currentUser, name, imageUrl: newImageUrl };
    setCurrentUser(updatedUser);
    localStorage.setItem(`profile_${user.uid}`, JSON.stringify({ name, imageUrl: newImageUrl }));
  }, [currentUser]);

  const value = useMemo(() => ({
    currentUser,
    loading,
    stories,
    comments,
    likes,
    reports,
    bookmarks,
    empathyRatings,
    login,
    logout,
    signup,
    addStory,
    updateStory,
    addComment,
    toggleLike,
    reportContent,
    updateUserProfile,
    toggleBookmark,
    rateEmpathy,
  }), [currentUser, loading, stories, comments, likes, reports, bookmarks, empathyRatings]);

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div className="flex justify-center items-center min-h-screen">
          <LoadingSpinner />
        </div>
      ) : children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
