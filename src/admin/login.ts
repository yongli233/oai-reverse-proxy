import { Router } from "express";

const loginRouter = Router();

loginRouter.get("/login", (_req, res) => {
  res.render("admin_login");
});

loginRouter.post("/login", (req, res) => {
  res.cookie("adminToken", req.body.token, {
    maxAge: 1000 * 60 * 60 * 24 * 14,
    httpOnly: true,
    sameSite: "strict",
  });

  res.redirect("/admin");
});

loginRouter.get("/logout", (req, res) => {
  res.clearCookie("adminToken");
  res.redirect("/admin/login");
});

loginRouter.get("/", (req, res) => {
  if (req.cookies.adminToken) {
    return res.redirect("/admin/manage");
  }
  res.redirect("/admin/login");
});

export { loginRouter };
