import React from 'react';
import ReactDOM from 'react-dom';

class FramePortal extends React.Component<{
  setIframe?: (iframe: HTMLIFrameElement) => void;
  className?: string;
  id?: string;
  children?: React.ReactNode;
}> {
  private containerEl: Element;
  private iframe: HTMLIFrameElement;

  constructor(props) {
    super(props);
    this.containerEl = document.createElement('div');
  }

  render() {
    return (
      <iframe
        id={this.props.id}
        title={this.props.id}
        ref={(el) => (this.iframe = el!)}
        className={this.props.className}
      >
        {ReactDOM.createPortal(this.props.children, this.containerEl)}
      </iframe>
    );
  }

  componentDidMount() {
    this.props.setIframe?.(this.iframe);

    if (this.iframe.contentWindow) {
      this.iframe.contentWindow.CromwellStore = window.CromwellStore;
    }

    const headMap = new Map();
    const updateHead = () => {
      Array.from(document.head.children).forEach((child) => {
        if (!headMap.has(child)) {
          const childCopy = child.cloneNode(true);
          headMap.set(child, childCopy);

          if (this.iframe.contentDocument) {
            this.iframe.contentDocument.head.appendChild(childCopy);
          }
        }
      });
    };
    updateHead();

    observeDOM(document.head, () => {
      updateHead();
    });

    if (this.iframe.contentDocument) {
      this.iframe.contentDocument.body.appendChild(this.containerEl);
    }
  }
}

const observeDOM = (function () {
  const MutationObserver = window.MutationObserver || (window as any).WebKitMutationObserver;

  return function (obj, callback) {
    if (!obj || obj.nodeType !== 1) return;

    if (MutationObserver) {
      // define a new observer
      const mutationObserver = new MutationObserver(callback);

      // have the observer observe foo for changes in children
      mutationObserver.observe(obj, { childList: true, subtree: true });
      return mutationObserver;
    }

    // browser support fallback
    // eslint-disable-next-line
    else if (!!window.addEventListener) {
      obj.addEventListener('DOMNodeInserted', callback, false);
      obj.addEventListener('DOMNodeRemoved', callback, false);
    }
  };
})();

export default FramePortal;
