import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Topbar from '../components/Topbar';
import AdminNav from '../components/AdminNav';

export default function AdminChecklist() {
  const { user, logout } = useAuth();
  const [stages, setStages] = useState([]);
  const [error, setError] = useState('');

  const [newStageName, setNewStageName] = useState('');
  const [addingStage, setAddingStage] = useState(false);

  const [editingStageId, setEditingStageId] = useState(null);
  const [editStageName, setEditStageName] = useState('');

  const [newQuestionText, setNewQuestionText] = useState({});
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [editQuestionText, setEditQuestionText] = useState('');

  function loadChecklist() {
    api.get('/checklist').then((res) => setStages(res.data));
  }

  useEffect(loadChecklist, []);

  async function addStage(e) {
    e.preventDefault();
    setError('');
    if (!newStageName.trim()) return;
    setAddingStage(true);
    try {
      await api.post('/checklist/stages', { name: newStageName.trim() });
      setNewStageName('');
      loadChecklist();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add stage');
    } finally {
      setAddingStage(false);
    }
  }

  function startEditStage(stage) {
    setEditingStageId(stage._id);
    setEditStageName(stage.name);
  }

  async function saveStage(id) {
    if (!editStageName.trim()) return;
    try {
      await api.put(`/checklist/stages/${id}`, { name: editStageName.trim() });
      setEditingStageId(null);
      loadChecklist();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update stage');
    }
  }

  async function deleteStage(id) {
    setError('');
    try {
      await api.delete(`/checklist/stages/${id}`);
      loadChecklist();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete stage');
    }
  }

  async function addQuestion(stageId) {
    const text = (newQuestionText[stageId] || '').trim();
    if (!text) return;
    setError('');
    try {
      await api.post(`/checklist/stages/${stageId}/questions`, { text });
      setNewQuestionText((prev) => ({ ...prev, [stageId]: '' }));
      loadChecklist();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add question');
    }
  }

  function startEditQuestion(question) {
    setEditingQuestionId(question._id);
    setEditQuestionText(question.text);
  }

  async function saveQuestion(id) {
    if (!editQuestionText.trim()) return;
    try {
      await api.put(`/checklist/questions/${id}`, { text: editQuestionText.trim() });
      setEditingQuestionId(null);
      loadChecklist();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update question');
    }
  }

  async function deleteQuestion(id) {
    setError('');
    try {
      await api.delete(`/checklist/questions/${id}`);
      loadChecklist();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete question');
    }
  }

  return (
    <div className="page">
      <Topbar>
        <span className="user-chip">
          {user?.name} <span className="role-badge">Admin</span>
        </span>
        <button className="link" onClick={logout}>
          Logout
        </button>
      </Topbar>
      <AdminNav />

      <div className="card wide">
        <h1>Audit Checklist</h1>
        <p style={{ marginTop: -10, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          These stages and questions are what every auditor sees when they start a new audit.
        </p>

        <form onSubmit={addStage} className="inline-form">
          <input
            placeholder="New stage name (e.g. Network & Connectivity)"
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
          />
          <button type="submit" disabled={addingStage}>
            {addingStage ? 'Adding...' : 'Add Stage'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}

        {stages.length === 0 && <p className="empty-state">No stages yet. Add one above.</p>}

        {stages.map((stage) => (
          <div key={stage._id} className="stage-block">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              {editingStageId === stage._id ? (
                <div className="inline-form" style={{ margin: 0, background: 'transparent', border: 'none', padding: 0, flex: 1 }}>
                  <input value={editStageName} onChange={(e) => setEditStageName(e.target.value)} />
                  <button type="button" onClick={() => saveStage(stage._id)}>
                    Save
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setEditingStageId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <h2 style={{ margin: 0, border: 'none', padding: 0 }}>{stage.name}</h2>
                  <div>
                    <button type="button" className="link" onClick={() => startEditStage(stage)} style={{ marginRight: 16 }}>
                      Rename
                    </button>
                    <button type="button" className="link" onClick={() => deleteStage(stage._id)}>
                      Delete Stage
                    </button>
                  </div>
                </>
              )}
            </div>

            {stage.questions.length === 0 && (
              <p className="empty-state" style={{ padding: '10px 0' }}>
                No questions in this stage yet.
              </p>
            )}

            {stage.questions.map((q) => (
              <div className="question" key={q._id}>
                {editingQuestionId === q._id ? (
                  <div className="inline-form" style={{ margin: 0, background: 'transparent', border: 'none', padding: 0 }}>
                    <input value={editQuestionText} onChange={(e) => setEditQuestionText(e.target.value)} />
                    <button type="button" onClick={() => saveQuestion(q._id)}>
                      Save
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setEditingQuestionId(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <p style={{ margin: 0 }}>{q.text}</p>
                    <div style={{ flexShrink: 0 }}>
                      <button type="button" className="link" onClick={() => startEditQuestion(q)} style={{ marginRight: 16 }}>
                        Edit
                      </button>
                      <button type="button" className="link" onClick={() => deleteQuestion(q._id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div className="inline-form" style={{ marginTop: 14 }}>
              <input
                placeholder="New question text"
                value={newQuestionText[stage._id] || ''}
                onChange={(e) => setNewQuestionText((prev) => ({ ...prev, [stage._id]: e.target.value }))}
              />
              <button type="button" onClick={() => addQuestion(stage._id)}>
                Add Question
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
