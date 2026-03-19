export function navigateWithTransition(
  url: string,
  router: { push: (url: string) => void }
) {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    document.startViewTransition(() => {
      router.push(url);
    });
  } else {
    router.push(url);
  }
}
