import React from 'react';
import {
  EuiPage,
  EuiPageBody,
  EuiFlexGroup,
  EuiFlexItem,
  useEuiTheme,
  useIsWithinBreakpoints,
} from '@elastic/eui';
import { css } from '@emotion/react';

interface SplitLayoutProps {
  left: React.ReactNode;
  right: React.ReactNode;
}

/**
 * Reusable two-column layout. The left panel (chat) takes ~40% with a minimum
 * width, the right panel (KQL editor + output) fills the remaining ~60%. On
 * narrow viewports the columns stack vertically. Both panels scroll
 * independently when their content overflows.
 */
export const SplitLayout: React.FC<SplitLayoutProps> = ({ left, right }) => {
  const { euiTheme } = useEuiTheme();
  const isStacked = useIsWithinBreakpoints(['xs', 's']);

  const leftCss = css({
    overflowY: 'auto',
    ...(isStacked
      ? { width: '100%' }
      : {
          flexBasis: '40%',
          minWidth: 340,
          borderRight: `${euiTheme.border.thin}`,
          borderRightColor: euiTheme.colors.lightShade,
        }),
  });

  const rightCss = css({
    overflowY: 'auto',
  });

  return (
    <EuiPage
      paddingSize="none"
      data-test-subj="queryCopilotSplitLayout"
      css={css({ height: '100%', flex: 1 })}
    >
      <EuiPageBody paddingSize="none" css={css({ height: '100%' })}>
        <EuiFlexGroup
          gutterSize="none"
          direction={isStacked ? 'column' : 'row'}
          responsive={false}
          css={css({ height: '100%' })}
        >
          <EuiFlexItem grow={false} css={leftCss} data-test-subj="queryCopilotSplitLeft">
            {left}
          </EuiFlexItem>
          <EuiFlexItem grow css={rightCss} data-test-subj="queryCopilotSplitRight">
            {right}
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPageBody>
    </EuiPage>
  );
};
