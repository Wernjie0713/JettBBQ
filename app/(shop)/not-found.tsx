import { NotFoundMessage } from "@/components/shop/not-found-message";

// notFound() inside shop pages (e.g. an unknown tracking link) renders here, within the shop chrome.
export default function ShopNotFound() {
  return <NotFoundMessage />;
}
