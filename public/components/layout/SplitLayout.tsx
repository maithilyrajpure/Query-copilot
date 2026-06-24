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
 *
 * The columns read as separate white cards on a light-gray page: there is no
 * hard divider line between them; instead the page is padded and the columns
 * are separated by a gutter.
 */
export const SplitLayout: React.FC<SplitLayoutProps> = ({ left, right }) => {
  const { euiTheme } = useEuiTheme();
  const isStacked = useIsWithinBreakpoints(['xs', 's']);

  const leftCss = css({
    overflowY: 'auto',
    minHeight: 0,
    ...(isStacked
      ? { width: '100%' }
      : {
          flexBasis: '40%',
          minWidth: 340,
        }),
  });

  const rightCss = css({
    overflowY: 'auto',
    minHeight: 0,
  });

  return (
    <EuiPage
      grow={false}
      paddingSize="none"
      data-test-subj="queryCopilotSplitLayout"
      css={css({ width: '100%', flexShrink: 0 })}
    >
      <EuiPageBody paddingSize="none" css={css({ padding: euiTheme.size.l })}>
        <EuiFlexGroup
          gutterSize="l"
          direction={isStacked ? 'column' : 'row'}
          responsive={false}
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
