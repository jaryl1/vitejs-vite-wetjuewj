import React, { useState, useEffect } from 'react';
import {
  Play,
  Settings,
  BookOpen,
  Clock,
  CheckCircle,
  XCircle,
  Sun,
  Download,
  List,
  Home,
  Type,
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  collection,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

// --- 强制写死 Firebase 配置 ---
(window as any).__firebase_config = JSON.stringify({
  apiKey: 'AIzaSyBBK80Av-hUPBMoVvz7e-FUry2r3qnIcic',
  authDomain: 'vocabulary-drilling.firebaseapp.com',
  projectId: 'vocabulary-drilling',
  storageBucket: 'vocabulary-drilling.firebasestorage.app',
  messagingSenderId: '331464682852',
  appId: '1:331464682852:web:3622238ca3751b0db8de71',
  measurementId: 'G-ZWNQQ561VV',
});
(window as any).__app_id = 'vocab-master-app';

const firebaseConfig = JSON.parse((window as any).__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = (window as any).__app_id;

// --- Helper: Text to Speech ---
const speak = (text: string) => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel(); // 防止重叠发音
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  }
};

const shuffle = (array: any[]) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [view, setView] = useState('home');
  const [theme, setTheme] = useState('light');

  // --- 核心：多设备同步码 ---
  const [syncCode, setSyncCode] = useState(
    () => localStorage.getItem('syncCode') || ''
  );
  const effectiveUid = syncCode.trim() || user?.uid; // 如果有同步码则用同步码，否则用匿名uid

  const [words, setWords] = useState<any[]>([]);
  const [settings, setSettings] = useState({
    dailyGoal: 50,
    spellingMode: false,
  });
  const [activeBook, setActiveBook] = useState('core');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error('Auth error:', err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Data Fetching (依赖 syncCode 变化)
  useEffect(() => {
    if (!effectiveUid) return;

    const wordsRef = collection(
      db,
      'artifacts',
      appId,
      'users',
      effectiveUid,
      'words'
    );
    const settingsRef = doc(
      db,
      'artifacts',
      appId,
      'users',
      effectiveUid,
      'settings',
      'config'
    );

    const unsubWords = onSnapshot(
      wordsRef,
      (snapshot) => {
        const w: any[] = [];
        snapshot.forEach((doc) => w.push({ id: doc.id, ...doc.data() }));
        setWords(w);
      },
      (err) => console.error(err)
    );

    const unsubSettings = onSnapshot(
      settingsRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSettings((prev) => ({ ...prev, ...data }));
          if (data.theme) setTheme(data.theme);
        }
      },
      (err) => console.error(err)
    );

    return () => {
      unsubWords();
      unsubSettings();
    };
  }, [effectiveUid]);

  // Apply Theme
  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [theme]);

  const updateSetting = async (key: string, value: any) => {
    if (!effectiveUid) return;
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    if (key === 'theme') setTheme(value);
    await setDoc(
      doc(db, 'artifacts', appId, 'users', effectiveUid, 'settings', 'config'),
      newSettings,
      { merge: true }
    );
  };

  const updateWordPhase = async (wordId: string, newPhase: number) => {
    if (!effectiveUid) return;
    setWords((prev) =>
      prev.map((w) => (w.id === wordId ? { ...w, phase: newPhase } : w))
    );
    await updateDoc(
      doc(db, 'artifacts', appId, 'users', effectiveUid, 'words', wordId),
      {
        phase: newPhase,
        lastPracticed: Date.now(),
      }
    );
  };

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center dark:bg-gray-900 dark:text-white">
        加载中...
      </div>
    );

  const currentBookWords = words.filter((w) => w.bookId === activeBook);
  const wordsToLearn = currentBookWords.filter((w) => w.phase < 3);
  const wordsMasteredToday = currentBookWords.filter(
    (w) => w.phase === 3 && w.lastPracticed > new Date().setHours(0, 0, 0, 0)
  ).length;

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        theme === 'dark'
          ? 'dark bg-gray-900 text-gray-100'
          : 'bg-gray-50 text-gray-800'
      }`}
    >
      <nav className="fixed bottom-0 w-full bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 pb-safe z-50">
        <div className="flex justify-around p-3">
          <NavItem
            icon={<Home />}
            label="主页"
            active={view === 'home'}
            onClick={() => setView('home')}
          />
          <NavItem
            icon={<BookOpen />}
            label="词表"
            active={view === 'words'}
            onClick={() => setView('words')}
          />
          <NavItem
            icon={<Settings />}
            label="设置"
            active={view === 'settings'}
            onClick={() => setView('settings')}
          />
        </div>
      </nav>

      <main className="pb-20 pt-4 px-4 max-w-md mx-auto h-screen overflow-y-auto">
        {view === 'home' && (
          <HomeView
            activeBook={activeBook}
            setActiveBook={setActiveBook}
            wordsToLearn={wordsToLearn}
            totalWords={currentBookWords.length}
            dailyGoal={settings.dailyGoal}
            masteredToday={wordsMasteredToday}
            onStart={() => setView('learn')}
            syncCode={syncCode}
            setSyncCode={(code: string) => {
              setSyncCode(code);
              if (code) localStorage.setItem('syncCode', code);
              else localStorage.removeItem('syncCode');
            }}
          />
        )}

        {view === 'learn' && (
          <LearnSession
            words={currentBookWords}
            settings={settings}
            onClose={() => setView('home')}
            updateWordPhase={updateWordPhase}
          />
        )}

        {view === 'words' && (
          <WordListView words={currentBookWords} activeBook={activeBook} />
        )}

        {view === 'settings' && (
          <SettingsView
            settings={settings}
            updateSetting={updateSetting}
            theme={theme}
            effectiveUid={effectiveUid}
            words={words}
          />
        )}
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center w-full space-y-1 ${
        active
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-gray-500 dark:text-gray-400'
      }`}
    >
      {React.cloneElement(icon, { size: 24 })}
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function HomeView({
  activeBook,
  setActiveBook,
  wordsToLearn,
  totalWords,
  dailyGoal,
  masteredToday,
  onStart,
  syncCode,
  setSyncCode,
}: any) {
  const [inputCode, setInputCode] = useState(syncCode);
  const isGoalReached = masteredToday >= dailyGoal;
  const remaining = Math.max(0, dailyGoal - masteredToday);
  const queueSize = Math.min(wordsToLearn.length, remaining);

  const handleBind = () => {
    const code = inputCode.trim();
    if (code) {
      setSyncCode(code);
      alert(`已绑定同步码 [${code}]！请在其他设备输入此码以共享进度。`);
    } else {
      setSyncCode('');
      alert('已取消同步，当前为本机独立数据。');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <header className="pt-4">
        <h1 className="text-2xl font-bold">考研刷词</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          今日目标: {masteredToday} / {dailyGoal}
        </p>
      </header>

      <div className="flex bg-gray-200 dark:bg-gray-700 p-1 rounded-xl">
        <button
          onClick={() => setActiveBook('core')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
            activeBook === 'core'
              ? 'bg-white dark:bg-gray-800 shadow text-blue-600 dark:text-blue-400'
              : ''
          }`}
        >
          核心词组
        </button>
        <button
          onClick={() => setActiveBook('ext')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
            activeBook === 'ext'
              ? 'bg-white dark:bg-gray-800 shadow text-blue-600 dark:text-blue-400'
              : ''
          }`}
        >
          拓展词组
        </button>
      </div>

      {/* 多设备同步卡片 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
            多设备共享进度
          </p>
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              syncCode
                ? 'bg-green-100 text-green-600'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {syncCode ? '已开启' : '未开启'}
          </span>
        </div>
        <div className="flex space-x-2">
          <input
            type="text"
            placeholder="输入同步码 (如 888888)"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleBind}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium active:scale-95 transition-transform"
          >
            {syncCode ? '更换' : '同步'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          手机和 iPad 输入相同的同步码即可实时共享刷词进度。
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
        <h2 className="text-4xl font-black text-blue-600 dark:text-blue-400 mb-2">
          {totalWords}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          当前词书总词数
        </p>
        {totalWords === 0 ? (
          <div className="text-orange-500 bg-orange-50 dark:bg-gray-700 dark:text-orange-400 p-4 rounded-xl text-sm">
            当前词书为空，请前往「设置」导入词库
          </div>
        ) : isGoalReached ? (
          <div className="text-green-600 bg-green-50 dark:bg-gray-700 dark:text-green-400 p-4 rounded-xl text-sm font-medium">
            🎉 今日目标已达成！休息一下吧。
          </div>
        ) : queueSize === 0 ? (
          <div className="text-blue-600 bg-blue-50 dark:bg-gray-700 dark:text-blue-400 p-4 rounded-xl text-sm font-medium">
            👏 本书已全部通关！
          </div>
        ) : (
          <button
            onClick={onStart}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-4 font-bold text-lg transition-transform active:scale-95 shadow-md flex items-center justify-center space-x-2"
          >
            <Play size={24} fill="currentColor" />
            <span>开始刷词 ({queueSize}词)</span>
          </button>
        )}
      </div>
    </div>
  );
}

// LearnSession 逻辑不变
function LearnSession({ words, settings, onClose, updateWordPhase }: any) {
  const [queue, setQueue] = useState<any[]>([]);
  const [currentWord, setCurrentWord] = useState<any>(null);
  const [step, setStep] = useState('question');
  const [choices, setChoices] = useState<any[]>([]);
  const [spellInput, setSpellInput] = useState('');
  const [spellError, setSpellError] = useState(false);
  const [sessionTime, setSessionTime] = useState(0);
  const [completedInSession, setCompletedInSession] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSessionTime((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const masteredToday = words.filter(
      (w: any) =>
        w.phase === 3 && w.lastPracticed > new Date().setHours(0, 0, 0, 0)
    ).length;
    let limit = Math.max(0, settings.dailyGoal - masteredToday);
    let pendingWords = shuffle(words.filter((w: any) => w.phase < 3)).slice(
      0,
      limit
    );

    if (pendingWords.length > 0) {
      setQueue(pendingWords);
      loadNextWord(pendingWords, pendingWords[0]);
    }
  }, []);

  const loadNextWord = (currentQueue: any[], nextWordOverride: any = null) => {
    const nextWord = nextWordOverride || currentQueue[0];
    if (!nextWord) {
      setCurrentWord(null);
      return;
    }
    setCurrentWord(nextWord);

    if (nextWord.phase === 0) {
      setStep('question');
      const distractors = shuffle(
        words.filter((w: any) => w.id !== nextWord.id)
      )
        .slice(0, 3)
        .map((w: any) => w.zh);
      setChoices(shuffle([nextWord.zh, ...distractors]));
      speak(nextWord.en);
    } else if (
      nextWord.phase === 1 ||
      (nextWord.phase === 2 && !settings.spellingMode)
    ) {
      setStep('question');
      speak(nextWord.en);
    } else if (nextWord.phase === 2 && settings.spellingMode) {
      setStep('spelling');
      setSpellInput('');
      setSpellError(false);
    }
  };

  const handleAdvance = (word: any, newPhase: number) => {
    updateWordPhase(word.id, newPhase);
    let newQueue = queue.filter((w) => w.id !== word.id);
    if (newPhase < 3) {
      const updatedWord = { ...word, phase: newPhase };
      if (newQueue.length > 0) {
        const insertIdx = Math.max(
          1,
          Math.floor(Math.random() * newQueue.length)
        );
        newQueue.splice(insertIdx, 0, updatedWord);
      } else {
        newQueue.push(updatedWord);
      }
    } else {
      setCompletedInSession((c) => c + 1);
    }
    setQueue(newQueue);
    loadNextWord(newQueue);
  };

  if (!currentWord && queue.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center space-y-6 animate-fade-in">
        <div className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center">
          <CheckCircle size={40} />
        </div>
        <h2 className="text-2xl font-bold">本组复习完成！</h2>
        <p className="text-gray-500">
          耗时: {formatTime(sessionTime)} | 过关: {completedInSession}词
        </p>
        <button
          onClick={onClose}
          className="bg-blue-600 text-white px-8 py-3 rounded-full font-medium"
        >
          返回主页
        </button>
      </div>
    );
  }
  if (!currentWord) return null;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 fixed inset-0 z-50 p-4">
      <div className="flex justify-between items-center text-gray-500 text-sm mt-4">
        <button onClick={onClose} className="p-2 -ml-2">
          <XCircle size={24} />
        </button>
        <div className="flex space-x-4">
          <span className="flex items-center">
            <Clock size={16} className="mr-1" /> {formatTime(sessionTime)}
          </span>
          <span>待复习: {queue.length}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm mx-auto">
        {currentWord.phase === 0 && step === 'question' && (
          <div className="w-full animate-fade-in-up">
            <h2 className="text-4xl font-bold text-center mb-8 break-words">
              {currentWord.en}
            </h2>
            <div className="space-y-3">
              {choices.map((c, i) => (
                <button
                  key={i}
                  onClick={() =>
                    c === currentWord.zh
                      ? handleAdvance(currentWord, 1)
                      : handleAdvance(currentWord, 0)
                  }
                  className="w-full p-4 text-left border-2 border-gray-200 rounded-2xl font-medium"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {currentWord.phase > 0 &&
          step === 'question' &&
          (!settings.spellingMode || currentWord.phase === 1) && (
            <div className="w-full flex flex-col h-full items-center justify-between py-10 animate-fade-in">
              <div className="flex-1 flex items-center justify-center">
                <h2 className="text-4xl font-bold">{currentWord.en}</h2>
              </div>
              <div className="w-full flex space-x-4">
                <button
                  onClick={() => {
                    setStep('answer');
                    setTimeout(() => handleAdvance(currentWord, 0), 1500);
                  }}
                  className="flex-1 py-4 bg-red-100 text-red-600 rounded-2xl font-bold"
                >
                  不认识
                </button>
                <button
                  onClick={() => setStep('answer')}
                  className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg"
                >
                  认识
                </button>
              </div>
            </div>
          )}

        {currentWord.phase > 0 &&
          step === 'answer' &&
          (!settings.spellingMode || currentWord.phase === 1) && (
            <div className="w-full flex flex-col h-full items-center justify-between py-10 animate-fade-in">
              <div className="flex-1 flex flex-col items-center justify-center space-y-6 w-full">
                <h2 className="text-4xl font-bold">{currentWord.en}</h2>
                <div className="p-6 bg-gray-100 rounded-2xl w-full text-center">
                  <p className="text-xl font-medium">{currentWord.zh}</p>
                </div>
              </div>
              <div className="w-full flex flex-col space-y-3">
                <div className="flex space-x-3 w-full">
                  <button
                    onClick={() => handleAdvance(currentWord, 0)}
                    className="flex-1 py-4 bg-gray-200 rounded-xl font-medium"
                  >
                    记错了
                  </button>
                  <button
                    onClick={() =>
                      handleAdvance(currentWord, currentWord.phase + 1)
                    }
                    className="flex-1 py-4 bg-green-500 text-white rounded-xl font-bold"
                  >
                    答对了
                  </button>
                </div>
                <button
                  onClick={() => handleAdvance(currentWord, 3)}
                  className="w-full py-3 text-gray-400 text-sm font-medium"
                >
                  太简单了，直接标熟
                </button>
              </div>
            </div>
          )}

        {currentWord.phase === 2 && settings.spellingMode && (
          <div className="w-full animate-fade-in text-center">
            <h2 className="text-2xl font-bold mb-4">{currentWord.zh}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  spellInput.trim().toLowerCase() ===
                  currentWord.en.toLowerCase()
                )
                  handleAdvance(currentWord, 3);
                else {
                  setSpellError(true);
                  setTimeout(() => handleAdvance(currentWord, 0), 2000);
                }
              }}
              className="flex flex-col space-y-4"
            >
              <input
                type="text"
                autoFocus
                value={spellInput}
                onChange={(e) => setSpellInput(e.target.value)}
                placeholder="输入英文..."
                className={`w-full text-center text-2xl p-4 border-b-2 bg-transparent ${
                  spellError ? 'border-red-500 text-red-500' : 'border-blue-500'
                }`}
              />
              {spellError && (
                <div className="text-red-500">正确答案: {currentWord.en}</div>
              )}
              {!spellError && (
                <button
                  type="submit"
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold"
                >
                  提交
                </button>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function WordListView({ words, activeBook }: any) {
  const [filter, setFilter] = useState('all');
  const filteredWords = words.filter((w: any) =>
    filter === 'all' ? true : w.phase === Number(filter)
  );
  return (
    <div className="space-y-4 pb-10 animate-fade-in">
      <h1 className="text-2xl font-bold pt-4">词汇表</h1>
      <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide">
        {['all', '0', '1', '2', '3'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-gray-200'
            }`}
          >
            {f === 'all' ? '全部' : f === '3' ? '已过关' : `阶段 ${f}`}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {filteredWords.length === 0 ? (
          <div className="text-center text-gray-400 py-10">暂无单词</div>
        ) : (
          filteredWords.map((w: any) => (
            <div
              key={w.id}
              className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border flex justify-between items-center"
            >
              <div>
                <p className="font-bold">{w.en}</p>
                <p className="text-sm text-gray-500 mt-1">{w.zh}</p>
              </div>
              <div className="flex items-center space-x-2">
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    w.phase === 3
                      ? 'bg-green-100 text-green-600'
                      : 'bg-blue-100 text-blue-600'
                  }`}
                >
                  {w.phase === 3 ? '熟' : `P${w.phase}`}
                </span>
                <button
                  onClick={() => speak(w.en)}
                  className="p-2 bg-gray-100 rounded-full text-blue-600"
                >
                  <Play size={14} fill="currentColor" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SettingsView({
  settings,
  updateSetting,
  theme,
  effectiveUid,
  words,
}: any) {
  const [importText, setImportText] = useState('');
  const [importBook, setImportBook] = useState('core');
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async () => {
    if (!importText.trim() || !effectiveUid) return;
    setIsImporting(true);
    try {
      const lines = importText.split('\n');
      const newWords: any[] = [];
      lines.forEach((line) => {
        const parts = line.split('|');
        if (parts.length >= 2)
          newWords.push({
            en: parts[0].trim(),
            zh: parts[1].trim(),
            phase: 0,
            bookId: importBook,
            lastPracticed: 0,
          });
      });
      if (newWords.length === 0) {
        alert('格式错误');
        setIsImporting(false);
        return;
      }

      const batch = writeBatch(db);
      let count = 0;
      for (const w of newWords) {
        const ref = doc(
          collection(db, 'artifacts', appId, 'users', effectiveUid, 'words')
        );
        batch.set(ref, w);
        count++;
        if (count >= 490) break;
      }
      await batch.commit();
      setImportText('');
      alert(`成功导入 ${count} 个词组！`);
    } catch (e) {
      alert('导入失败');
    }
    setIsImporting(false);
  };

  // --- 新增：真正的重置逻辑 ---
  const handleReset = async (bookId: string) => {
    // 二次确认拦截
    if (
      !window.confirm(
        `确定要重置【${
          bookId === 'core' ? '核心' : '拓展'
        }】词书的所有进度吗？此操作不可逆！`
      )
    )
      return;

    try {
      const batch = writeBatch(db);
      // 只挑出这本书里进度大于0的词
      const wordsToReset = words.filter(
        (w: any) => w.bookId === bookId && w.phase > 0
      );

      if (wordsToReset.length === 0) {
        alert('当前词书没有进度需要重置。');
        return;
      }

      wordsToReset.forEach((w: any) => {
        const ref = doc(
          db,
          'artifacts',
          appId,
          'users',
          effectiveUid,
          'words',
          w.id
        );
        batch.update(ref, { phase: 0, lastPracticed: 0 });
      });

      await batch.commit();
      alert('进度已重置完毕！');
    } catch (error) {
      console.error(error);
      alert('重置失败，请重试');
    }
  };
  // ----------------------------

  return (
    <div className="space-y-8 pb-10 animate-fade-in pt-4">
      <h1 className="text-2xl font-bold">设置</h1>
      <section className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl divide-y border dark:border-gray-700">
          <div className="p-4 flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <Sun size={20} />
              <span className="font-medium">外观主题</span>
            </div>
            <select
              value={theme}
              onChange={(e) => updateSetting('theme', e.target.value)}
              className="bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-1 text-sm outline-none"
            >
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </div>
          <div className="p-4 flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <List size={20} />
              <span className="font-medium">每日刷词量</span>
            </div>
            <select
              value={settings.dailyGoal}
              onChange={(e) =>
                updateSetting('dailyGoal', Number(e.target.value))
              }
              className="bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-1 text-sm outline-none"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
          <div className="p-4 flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <Type size={20} />
              <div>
                <p className="font-medium">拼写模式 (阶段2)</p>
              </div>
            </div>
            <button
              onClick={() =>
                updateSetting('spellingMode', !settings.spellingMode)
              }
              className={`w-12 h-6 rounded-full relative transition-colors ${
                settings.spellingMode
                  ? 'bg-blue-600'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                  settings.spellingMode ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border dark:border-gray-700 space-y-3">
          <p className="text-sm font-medium">导入词汇 (格式: 英文 | 中文)</p>
          <select
            value={importBook}
            onChange={(e) => setImportBook(e.target.value)}
            className="bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2 text-sm w-full outline-none"
          >
            <option value="core">核心词组</option>
            <option value="ext">拓展词组</option>
          </select>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={'apple | 苹果\nbanana | 香蕉'}
            className="w-full h-32 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-xl p-3 text-sm focus:outline-none"
          />
          <button
            onClick={handleImport}
            disabled={isImporting || !importText.trim()}
            className="w-full py-3 bg-blue-600 disabled:bg-blue-300 text-white rounded-xl font-medium flex items-center justify-center space-x-2"
          >
            <Download size={18} />
            <span>{isImporting ? '导入中...' : '确认导入'}</span>
          </button>
        </div>
      </section>

      {/* --- 新增：危险操作按钮区 --- */}
      <section className="space-y-4 pb-8">
        <h3 className="text-sm font-bold text-red-500 uppercase tracking-wider">
          危险操作
        </h3>
        <div className="flex space-x-2">
          <button
            onClick={() => handleReset('core')}
            className="flex-1 py-3 border border-red-200 dark:border-red-900/50 text-red-600 bg-red-50 dark:bg-red-900/10 rounded-xl text-sm font-medium active:scale-95 transition-transform"
          >
            重置核心进度
          </button>
          <button
            onClick={() => handleReset('ext')}
            className="flex-1 py-3 border border-red-200 dark:border-red-900/50 text-red-600 bg-red-50 dark:bg-red-900/10 rounded-xl text-sm font-medium active:scale-95 transition-transform"
          >
            重置拓展进度
          </button>
        </div>
      </section>
    </div>
  );
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
