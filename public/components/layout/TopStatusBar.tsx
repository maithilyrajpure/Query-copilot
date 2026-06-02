import React from 'react';
import {
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiTitle,
  EuiText,
  EuiIcon,
  EuiBadge,
  EuiAvatar,
} from '@elastic/eui';

interface TopStatusBarProps {
  statusBadge?: React.ReactNode;
}

/**
 * Horizontal status bar rendered above the split layout. Shows the application
 * title/subtitle on the left and a status badge plus the analyst avatar on the
 * right. The real status badge is wired in a later task; a neutral placeholder
 * is shown until then.
 */
export const TopStatusBar: React.FC<TopStatusBarProps> = ({ statusBadge }) => {
  return (
    <EuiPanel
      hasShadow={false}
      hasBorder
      paddingSize="m"
      borderRadius="none"
      data-test-subj="queryCopilotTopStatusBar"
    >
      <EuiFlexGroup
        alignItems="center"
        justifyContent="spaceBetween"
        gutterSize="m"
        responsive={false}
      >
        <EuiFlexItem grow={false}>
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiIcon type="logoSecurity" size="l" />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup direction="column" gutterSize="none" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiTitle size="s">
                    <h1>Query Copilot</h1>
                  </EuiTitle>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="xs" color="subdued">
                    Security Log Investigation
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
            <EuiFlexItem grow={false}>
              {statusBadge ?? <EuiBadge color="hollow">Status</EuiBadge>}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiAvatar name="Analyst" size="m" />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
