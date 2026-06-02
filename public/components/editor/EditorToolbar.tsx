import React from 'react';
import { EuiButton, EuiButtonEmpty, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';

import { useCopilot } from '../../store/copilot.context';
import { useQueryExecution } from '../../hooks/useQueryExecution';

export interface EditorToolbarProps {
  isEditing: boolean;
  onToggleEdit: () => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({ isEditing, onToggleEdit }) => {
  const { state } = useCopilot();
  const { executeQuery, isExecuting } = useQueryExecution();

  return (
    <EuiFlexGroup
      alignItems="center"
      gutterSize="s"
      justifyContent="flexEnd"
      responsive={false}
    >
      <EuiFlexItem grow={false}>
        <EuiButtonEmpty
          size="s"
          iconType="pencil"
          onClick={onToggleEdit}
          aria-pressed={isEditing}
          data-test-subj="queryCopilotEditorEditToggle"
        >
          {isEditing ? 'Done' : 'Edit'}
        </EuiButtonEmpty>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiButton
          fill
          color="primary"
          size="s"
          iconType="play"
          isLoading={isExecuting}
          disabled={isExecuting || state.currentKQL.trim().length === 0}
          onClick={() => {
            void executeQuery(state.currentKQL, state.indexPattern);
          }}
          data-test-subj="queryCopilotEditorRunButton"
        >
          Run Query
        </EuiButton>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
