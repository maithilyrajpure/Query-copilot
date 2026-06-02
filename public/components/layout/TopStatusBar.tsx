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
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';

interface TopStatusBarProps {
  statusBadge?: React.ReactNode;
}

/**
 * Horizontal status bar rendered above the split layout. Shows a blue rounded
 * logo square + the application title/subtitle on the left, and a status badge
 * plus the analyst avatar on the right. The real status badge is wired in a
 * later task; the success badge below is the default placeholder.
 */
export const TopStatusBar: React.FC<TopStatusBarProps> = ({ statusBadge }) => {
  const { euiTheme } = useEuiTheme();

  const logoCss = css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: euiTheme.border.radius.medium,
    backgroundColor: euiTheme.colors.primary,
  });

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
              <div css={logoCss}>
                <EuiIcon type="search" color="ghost" />
              </div>
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
              {statusBadge ?? <EuiBadge color="success">All Systems Operational</EuiBadge>}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiAvatar name="Analyst User" initials="AU" size="m" color={euiTheme.colors.primary} />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
