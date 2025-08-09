//pages\admin\password\CreateAccount.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/components/LanguageSwitcher';
import zhTW from '@/app/data/language/zh-TW.json';
import enUS from '@/app/data/language/en-US.json';
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

/**
 * 新增使用者帳號頁面
 */
const CreateAccount: React.FC = () => {
  const { language } = useLanguage();
  const translationMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    "de": deDE,
  };
  const translations = translationMap[language] || zhTW;
  const t = translations.Admin.Account.CreateAccount;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // 訊息一秒後自動清除
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 1000);
    return () => clearTimeout(timer);
  }, [message]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setMessage(t.not_match);
      return;
    }
    try {
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(t.success);
        setUsername('');
        setPassword('');
        setConfirmPassword('');
      } else {
        setMessage(`${t.fail}${data.error ? '：' + data.error : ''}`);
      }
    } catch (err: any) {
      setMessage(`${t.fail}：${err.message}`);
    }
  };

  return (
    <Container>
      <div className="max-w-md mx-auto bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold">{t.title}</h2>
        {message && (
          <div
            className={`px-4 py-2 rounded text-white ${
              message.startsWith('✅') ? 'bg-green-500' : 'bg-red-500'
            }`}
          >
            {message}
          </div>
        )}
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">{t.username}</label>
            <input
              type="text"
              className="w-full border p-2 rounded-md"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">{t.password}</label>
            <input
              type="password"
              className="w-full border p-2 rounded-md"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">{t.confirm_password}</label>
            <input
              type="password"
              className="w-full border p-2 rounded-md"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
          >
            {t.create}
          </button>
        </form>
      </div>
    </Container>
  );
};

export default CreateAccount;