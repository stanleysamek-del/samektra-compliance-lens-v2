export function useRouter() {
  return {
    push: (url: string) => window.history.pushState({}, "", url),
    refresh: () => {},
  };
}
