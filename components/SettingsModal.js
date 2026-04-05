import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { logout } from '@/lib/api';

export default function SettingsModal({ show, onClose }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(true);
  const [sounds, setSounds] = useState(true);
  const [theme, setTheme] = useState('light');

  if (!show) return null;

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const settings = [
    {
      section: 'Notifications',
      items: [
        {
          label: 'Message notifications',
          description: 'Get notified of new messages',
          type: 'toggle',
          value: notifications,
          onChange: setNotifications
        },
        {
          label: 'Sound alerts',
          description: 'Play sound for new messages',
          type: 'toggle',
          value: sounds,
          onChange: setSounds
        }
      ]
    },
    {
      section: 'Appearance',
      items: [
        {
          label: 'Theme',
          description: 'Choose your preferred theme',
          type: 'select',
          value: theme,
          options: [
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' }
          ],
          onChange: setTheme
        }
      ]
    },
    {
      section: 'Privacy & Security',
      items: [
        {
          label: 'Last seen',
          description: 'Control who can see when you were last online',
          type: 'button',
          onClick: () => alert('Feature coming soon!')
        },
        {
          label: 'Read receipts',
          description: 'Let others know when you\'ve read their messages',
          type: 'button',
          onClick: () => alert('Feature coming soon!')
        }
      ]
    }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-96 max-w-full max-h-[80vh] mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Settings Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {settings.map((section, sectionIndex) => (
            <div key={sectionIndex} className="mb-6 last:mb-0">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">
                {section.section}
              </h3>
              
              <div className="space-y-3">
                {section.items.map((item, itemIndex) => (
                  <div key={itemIndex} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{item.label}</div>
                      <div className="text-sm text-gray-500">{item.description}</div>
                    </div>
                    
                    {/* Toggle Switch */}
                    {item.type === 'toggle' && (
                      <button
                        onClick={() => item.onChange(!item.value)}
                        className={`relative w-11 h-6 rounded-full transition-colors ${
                          item.value ? 'bg-indigo-600' : 'bg-gray-300'
                        }`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                          item.value ? 'translate-x-5' : 'translate-x-0.5'
                        }`} />
                      </button>
                    )}
                    
                    {/* Select Dropdown */}
                    {item.type === 'select' && (
                      <select
                        value={item.value}
                        onChange={(e) => item.onChange(e.target.value)}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {item.options.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}
                    
                    {/* Button */}
                    {item.type === 'button' && (
                      <button
                        onClick={item.onClick}
                        className="flex items-center space-x-1 text-indigo-600 hover:text-indigo-700"
                      >
                        <span className="text-sm">Configure</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Account Actions */}
          <div className="border-t border-gray-200 pt-6 mt-6">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">
              Account
            </h3>
            
            <div className="space-y-3">
              <button 
                onClick={() => router.push('/dashboard')}
                className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors text-left"
              >
                <div>
                  <div className="font-medium text-gray-900">Dashboard</div>
                  <div className="text-sm text-gray-500">Return to main dashboard</div>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              
              <button 
                onClick={handleLogout}
                className="w-full flex items-center justify-between p-3 hover:bg-red-50 text-red-600 rounded-lg transition-colors text-left"
              >
                <div>
                  <div className="font-medium">Sign Out</div>
                  <div className="text-sm text-red-500">Sign out of your account</div>
                </div>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}