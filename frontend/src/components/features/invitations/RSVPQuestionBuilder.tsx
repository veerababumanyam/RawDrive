import React, { useState, useCallback } from 'react';
import { Settings, Plus, X } from 'lucide-react';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { Select, Checkbox } from '@/components/ui/FormControls';
import type { RSVPCustomQuestion } from '@/types/invitations';

interface RSVPQuestionBuilderProps {
  questions: RSVPCustomQuestion[];
  onChange: (questions: RSVPCustomQuestion[]) => void;
  className?: string;
}

export const RSVPQuestionBuilder: React.FC<RSVPQuestionBuilderProps> = ({
  questions,
  onChange,
  className = '',
}) => {
  const [newQuestion, setNewQuestion] = useState('');
  const [newQuestionType, setNewQuestionType] = useState<
    'text' | 'select' | 'checkbox'
  >('text');

  const addQuestion = useCallback(() => {
    if (!newQuestion.trim()) return;

    const question: RSVPCustomQuestion = {
      question: newQuestion.trim(),
      type: newQuestionType,
      required: false,
      options: newQuestionType === 'select' ? ['Option 1', 'Option 2'] : undefined,
    };

    onChange([...questions, question]);
    setNewQuestion('');
  }, [newQuestion, newQuestionType, questions, onChange]);

  const removeQuestion = useCallback(
    (index: number) => {
      onChange(questions.filter((_, i) => i !== index));
    },
    [questions, onChange]
  );

  const updateQuestion = useCallback(
    (index: number, updates: Partial<RSVPCustomQuestion>) => {
      const updatedQuestions = [...questions];
      updatedQuestions[index] = { ...updatedQuestions[index], ...updates };
      onChange(updatedQuestions);
    },
    [questions, onChange]
  );

  return (
    <div className={`space-y-4 ${className}`}>
      <h4 className="text-base font-medium text-text-primary mb-4">
        Custom Questions
      </h4>

      {/* Existing Questions List */}
      {questions.length > 0 && (
        <div className="space-y-3 mb-4">
          {questions.map((q, index) => (
            <div
              key={index}
              className="p-3 bg-surface-hover rounded-lg border border-border"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium text-text-primary">{q.question}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-text-secondary">
                    <span className="capitalize px-1.5 py-0.5 bg-surface rounded border border-border">
                      {q.type}
                    </span>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) =>
                          updateQuestion(index, { required: e.target.checked })
                        }
                        className="rounded border-border text-primary focus:ring-primary w-3 h-3"
                      />
                      <span>Required</span>
                    </label>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeQuestion(index)}
                  className="text-text-tertiary hover:text-error p-1 group"
                  aria-label="Remove question"
                  title="Remove question"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Options for Select Type */}
              {q.type === 'select' && (
                <div className="mt-3 pl-4 border-l-2 border-border">
                  <p className="text-xs text-text-secondary mb-1">Options:</p>
                  <div className="flex flex-wrap gap-2">
                    {q.options?.map((opt, optIndex) => (
                      <div
                        key={optIndex}
                        className="flex items-center gap-1 px-2 py-1 bg-surface rounded text-xs"
                      >
                        <span>{opt}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newOptions = q.options?.filter((_, i) => i !== optIndex);
                            updateQuestion(index, { options: newOptions });
                          }}
                          className="text-text-tertiary hover:text-error ml-1"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        placeholder="Add option..."
                        className="text-xs px-2 py-1 rounded border border-border bg-surface focus:outline-none focus:border-primary w-24"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = (e.target as HTMLInputElement).value.trim();
                            if (val) {
                              updateQuestion(index, {
                                options: [...(q.options || []), val],
                              });
                              (e.target as HTMLInputElement).value = '';
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add New Question */}
      <div className="flex gap-2 items-start">
        <div className="flex-1">
          <AppInput
            placeholder="Ask a question..."
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addQuestion();
              }
            }}
          />
        </div>
        <Select
          options={[
            { value: 'text', label: 'Text Input' },
            { value: 'select', label: 'Multiple Choice' },
            { value: 'checkbox', label: 'Checkbox (Yes/No)' },
          ]}
          value={newQuestionType}
          onChange={(e) =>
            setNewQuestionType(e.target.value as 'text' | 'select' | 'checkbox')
          }
          fullWidth={false}
          className="w-36"
        />
        <AppButton
          variant="secondary"
          onClick={addQuestion}
          disabled={!newQuestion.trim()}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add
        </AppButton>
      </div>
    </div>
  );
};
