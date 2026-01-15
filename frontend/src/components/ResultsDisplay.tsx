import React from 'react';

interface ResultsDisplayProps {
  syncJobId: string;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ syncJobId }) => {
  // State for job status and results will be added here
  // Polling logic with react-query will be added here

  return (
    <div className="mt-4">
      <h3 className="text-lg font-semibold">Sync Results</h3>
      <p>Job ID: {syncJobId}</p>
      {/* Status and results will be rendered here */}
    </div>
  );
};

export default ResultsDisplay;
