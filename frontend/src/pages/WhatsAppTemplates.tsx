import { useState } from 'react';
import Layout from '../components/layout/Layout';

interface Template {
  id: string;
  name: string;
  label: string;
  language: 'he' | 'en';
  content: string;
}

const defaultTemplates: Template[] = [
  {
    id: 'payment_reminder_he',
    name: 'payment_reminder',
    label: 'תזכורת תשלום',
    language: 'he',
    content: `שלום {tenant_name},

תזכורת ידידותית לתשלום דמי הבית עבור {building_name}.

🏠 דירה: {apartment_number}
💰 סכום לתשלום: {amount}₪
📅 תקופה: {period}

אנא העבירו את התשלום בהקדם האפשרי.

תודה רבה!`,
  },
  {
    id: 'payment_reminder_en',
    name: 'payment_reminder',
    label: 'Payment Reminder',
    language: 'en',
    content: `Hello {tenant_name},

Friendly reminder for your building payment for {building_name}.

🏠 Apartment: {apartment_number}
💰 Amount due: ₪{amount}
📅 Period: {period}

Please transfer the payment as soon as possible.

Thank you!`,
  },
  {
    id: 'payment_received_he',
    name: 'payment_received',
    label: 'אישור קבלת תשלום',
    language: 'he',
    content: `שלום {tenant_name},

קיבלנו את תשלומך עבור דמי הבית!

🏠 דירה: {apartment_number}
💰 סכום: {amount}₪
✅ התקבל בהצלחה

תודה רבה!`,
  },
  {
    id: 'payment_received_en',
    name: 'payment_received',
    label: 'Payment Received',
    language: 'en',
    content: `Hello {tenant_name},

We received your building payment!

🏠 Apartment: {apartment_number}
💰 Amount: ₪{amount}
✅ Received successfully

Thank you!`,
  },
];

export default function WhatsAppTemplates() {
  const [templates, setTemplates] = useState<Template[]>(defaultTemplates);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!editingTemplate) return;

    setTemplates(templates.map(t =>
      t.id === editingTemplate.id ? editingTemplate : t
    ));
    setEditingTemplate(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = (templateId: string) => {
    const defaultTemplate = defaultTemplates.find(t => t.id === templateId);
    if (defaultTemplate) {
      setTemplates(templates.map(t =>
        t.id === templateId ? defaultTemplate : t
      ));
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-700 rounded-2xl shadow-lg p-8 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">תבניות WhatsApp</h1>
              <p className="text-purple-100 text-lg">
                ערוך את תבניות ההודעות שנשלחות לדיירים
              </p>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-6">
              <div className="text-5xl">💬</div>
            </div>
          </div>
        </div>

        {/* Success Message */}
        {saved && (
          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <p className="font-semibold text-green-800">השינויים נשמרו בהצלחה!</p>
            </div>
          </div>
        )}

        {/* Templates Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-xl shadow-md border-2 border-gray-200 overflow-hidden hover:border-primary-300 transition-colors"
            >
              {/* Header */}
              <div className={`p-4 ${template.language === 'he' ? 'bg-blue-50' : 'bg-green-50'} border-b-2 ${template.language === 'he' ? 'border-blue-200' : 'border-green-200'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">{template.label}</h3>
                    <p className="text-sm text-gray-600">
                      {template.language === 'he' ? '🇮🇱 עברית' : '🇬🇧 English'}
                    </p>
                  </div>
                  <button
                    onClick={() => setEditingTemplate(template)}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
                  >
                    ✏️ ערוך
                  </button>
                </div>
              </div>

              {/* Preview */}
              <div className="p-4">
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans" dir={template.language === 'he' ? 'rtl' : 'ltr'}>
                    {template.content}
                  </pre>
                </div>
                <button
                  onClick={() => handleReset(template.id)}
                  className="mt-3 text-sm text-gray-600 hover:text-gray-800 underline"
                >
                  🔄 אפס לברירת מחדל
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Variables Help */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6">
          <h3 className="font-bold text-blue-900 text-lg mb-4">📝 משתנים זמינים</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-white rounded-lg p-3 border border-blue-200">
              <code className="font-mono text-blue-700">{'{tenant_name}'}</code>
              <p className="text-gray-600 mt-1">שם הדייר</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-blue-200">
              <code className="font-mono text-blue-700">{'{building_name}'}</code>
              <p className="text-gray-600 mt-1">שם הבניין</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-blue-200">
              <code className="font-mono text-blue-700">{'{apartment_number}'}</code>
              <p className="text-gray-600 mt-1">מספר דירה</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-blue-200">
              <code className="font-mono text-blue-700">{'{amount}'}</code>
              <p className="text-gray-600 mt-1">סכום</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-blue-200">
              <code className="font-mono text-blue-700">{'{period}'}</code>
              <p className="text-gray-600 mt-1">תקופה</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-blue-200">
              <code className="font-mono text-blue-700">{'{custom_message}'}</code>
              <p className="text-gray-600 mt-1">הודעה מותאמת</p>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-600 to-pink-700 p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">✏️</span>
                  <h3 className="text-2xl font-bold">{editingTemplate.label}</h3>
                </div>
                <button
                  onClick={() => setEditingTemplate(null)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                תוכן התבנית
              </label>
              <textarea
                value={editingTemplate.content}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, content: e.target.value })}
                className="w-full h-80 px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors font-sans"
                dir={editingTemplate.language === 'he' ? 'rtl' : 'ltr'}
                placeholder="הקלד את תוכן ההודעה כאן..."
              />
              <p className="text-sm text-gray-500 mt-2">
                השתמש במשתנים כמו {'{tenant_name}'}, {'{amount}'}, וכו׳
              </p>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 flex gap-3 justify-end border-t">
              <button
                onClick={() => setEditingTemplate(null)}
                className="px-6 py-2 border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors shadow-md"
              >
                💾 שמור שינויים
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
