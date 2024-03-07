import { Router } from "express";

const loginRouter = Router();

loginRouter.get("/login", (_req, res) => {
  res.render("admin_login");
});

loginRouter.post("/login", (req, res) => {
<<<<<<< HEAD
  res.cookie("adminToken", req.body.token, {
    maxAge: 1000 * 60 * 60 * 24 * 14,
    httpOnly: true,
    sameSite: "strict",
  });

=======
  req.session.adminToken = req.body.token;
>>>>>>> upstream/main
  res.redirect("/admin");
});

loginRouter.get("/logout", (req, res) => {
<<<<<<< HEAD
  res.clearCookie("adminToken");
=======
  delete req.session.adminToken;
>>>>>>> upstream/main
  res.redirect("/admin/login");
});

loginRouter.get("/", (req, res) => {
<<<<<<< HEAD
  if (req.cookies.adminToken) {
=======
  if (req.session.adminToken) {
>>>>>>> upstream/main
    return res.redirect("/admin/manage");
  }
  res.redirect("/admin/login");
});

export { loginRouter };
