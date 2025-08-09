//pages\admin\password\ChangePassword.tsx
'use client';
import React, { useState } from 'react';
import { useLanguage } from '@/components/LanguageSwitcher';
import zhTW from '@/app/data/language/zh-TW.json';
import enUS from '@/app/data/language/en-US.json';
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

const ChangePasswordPage: React.FC = () => {
  const { language } = useLanguage();
  const translationMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    "de": deDE,
  };
  const translations = translationMap[language] || zhTW;
  const t = translations.Admin.Account.ChangePassword;

  const [step, setStep] = useState<'verify' | 'reset'>('verify');
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, currentPassword, newPassword: '', confirmPassword: '' })
    });
    const data = await res.json();
    if (res.ok && data.verify) {
      setStep('reset');
    } else {
      alert(data.error || t.verify_failed);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, currentPassword, newPassword, confirmPassword })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert(t.change_success);
      setStep('verify');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      alert(data.error || t.change_failed);
    }
  };

  return (
    <Container>
      <div className="max-w-md mx-auto bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 space-y-4">
        {step === 'verify' ? (
          <form onSubmit={handleVerify} className="space-y-4">
            <h2 className="text-xl font-semibold">{t.title_verify}</h2>
            <div>
              <label className="block">{t.username}</label>
              <input
                className="w-full border p-2"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block">{t.current_password}</label>
              <input
                type="password"
                className="w-full border p-2"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded">{t.verify}</button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <h2 className="text-xl font-semibold">{t.title_reset}</h2>
            <div>
              <label className="block">{t.new_password}</label>
              <input
                type="password"
                className="w-full border p-2"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block">{t.confirm_new_password}</label>
              <input
                type="password"
                className="w-full border p-2"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="px-4 py-2 bg-green-500 text-white rounded">{t.change}</button>
          </form>
        )}
      </div>
    </Container>
  );
};

export default ChangePasswordPage;
