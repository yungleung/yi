/**
 * Public entrypoint for the app's Help-menu actions.
 *
 * Example: the composition root registers `registerIssueCommand` once beside
 * the tutorial and Documentation commands.
 *
 * May import: the help domain's implementation modules. Upholds: the shell
 * depends on one explicit Help surface rather than implementation paths.
 */

export { REPORT_ISSUE_URL, openIssueTracker, registerIssueCommand } from './report_issue';
