import { Component, type ReactNode } from 'react';
import { Result, Button } from 'antd';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('CRM Error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="500"
          title="Đã có lỗi xảy ra"
          subTitle="Đã xảy ra lỗi không mong muốn. Vui lòng tải lại trang."
          extra={
            <Button type="primary" onClick={() => window.location.reload()}>
              Tải lại trang
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}
