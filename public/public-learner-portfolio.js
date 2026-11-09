import { learnerPortfolioMarkup } from "./learner-portfolio-content.js";

const host = document.getElementById("learner-portfolio-public");
const id = location.pathname.split("/").filter(Boolean).at(-1);
try {
  const response = await fetch(`/api/course/portfolios/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 404 ? "This portfolio is unavailable." : "The portfolio could not load. Try again shortly.");
  const portfolio = await response.json();
  document.title = `${portfolio.title} · Collavibe`;
  document.querySelector("h1").textContent = portfolio.title;
  host.innerHTML = learnerPortfolioMarkup(portfolio);
  host.querySelector("h2").remove();
} catch (error) {
  host.textContent = error.message;
}
