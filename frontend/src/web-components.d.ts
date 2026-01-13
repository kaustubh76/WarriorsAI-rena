/**
 * Web Components Type Declarations
 * Provides TypeScript support for custom HTML elements like w3m-connect-button (WalletConnect)
 */

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'w3m-connect-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
      'w3m-account-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
      'w3m-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
      'w3m-network-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }
  }
}
