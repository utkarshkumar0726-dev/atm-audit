import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import Topbar from '../components/Topbar';

export default function AdminAuditDetail() {
  const { id } = useParams();
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get(`/audits/${id}`)
      .then((res) => setAudit(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load audit'));
  }, [id]);

  if (error) {
    return (
      <div className="page-center">
        <div className="card">
          <p className="error">{error}</p>
          <Link to="/admin">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="page-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <Topbar>
        <Link to="/admin" className="link">
          &larr; Back to dashboard
        </Link>
      </Topbar>

      <div className="card wide">
        <h1>Audit Detail</h1>
        <p>
          <strong>ATM ID:</strong> {audit.atmId}
        </p>
        <p>
          <strong>Area:</strong> {audit.area}
        </p>
        <p>
          <strong>Auditor:</strong> {audit.auditor?.name} ({audit.auditor?.username})
        </p>
        <p>
          <strong>Submitted:</strong> {new Date(audit.createdAt).toLocaleString()}
        </p>

        {audit.photos?.length > 0 && (
          <div className="photo-grid photo-grid-view">
            {audit.photos.map((p, i) => (
              <div className="photo-grid-item" key={i}>
                <img src={p} alt={`ATM ${audit.atmId} ${i + 1}`} />
              </div>
            ))}
          </div>
        )}

        {audit.stages.map((stage) => (
          <div key={stage.stageId} className="stage-block">
            <h2>{stage.stageName}</h2>
            {stage.questions.map((q) => (
              <div className="question readonly" key={q.questionId}>
                <p>{q.questionText}</p>
                <p className={q.answer === 'yes' ? 'answer-yes' : 'answer-no'}>{q.answer.toUpperCase()}</p>
                {q.answer === 'no' && <p className="reason">Reason: {q.reason}</p>}
                {q.photos?.length > 0 && (
                  <div className="photo-grid photo-grid-view">
                    {q.photos.map((p, i) => (
                      <div className="photo-grid-item" key={i}>
                        <img src={p} alt="Attached" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
