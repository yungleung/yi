---
title: "Geometric and Kinematic Foundations of Lagrangian Mechanics"
author:
date: 2023-07-07
id: 20230707183022
keywords:
  - Curvature
  - Torsion
  - vector field
  - integral curve
  - surface
  - geodesic
  - Riemannian manifold
---

## Overview

**Geometric Constraints**: **The first step** in the construction of a mathematical model for studying the motion of a system consisting of a certain number of points is necessarily the investigation of its geometrical properties. Such properties depend on the possible presence of limitations (constraints) imposed on the position of each single point with respect to a given reference frame.

## Curves in the plane

Non-singular point on the curve [@Fasano2006, p. 1]

$$
\nabla F(x_1,x_2)\neq 0
$$

regular curve, if all the points on it is non-singular. By the implicit function theorem, if $P$ is non-singular, in a neighborhood of $P$ the curve is representable as the graph of a function which is differentiable in the same neighborhood. That means the possibility to use a **parametric representation**. This gives an equivalent definition of non-singular,

$$
\.{\bm x}(t_0)\neq 0
$$

## Length of a curve and natural parametrization

The length could be interpreted as integration of velocity with time

$$
l=\int^b_a |\.{\bm x}(t)|dt
$$

The natural parametrization is the *arc length*.

## Tangent vector, normal vector and curvature of plane curves

Using the natural parametrization, the vector $d\bm x/ds$ is of unit norm. From

$$
{d^2\bm x\over ds^2}\cdot {d\bm x\over ds}=0
$$

we can define the unit **tangent vector** as

$$
\bm t(s)={d\bm x(s)\over ds}
$$

and the **principal unit normal vector**

$$
\bm n(s)={1\over k(s)}{d^2\bm x\over ds^2},
$$

where $k(s)=|d^2\bm x/ds^2|$ is the **curvature**, and $R(s)=1/k(s)$ is the **radius of curvature**.

Also see chapter Vector-Valued Functions and Motions in Space of Thomas' Calculus [@Hass2022, p. 760-796].

Considering a generic parametrisation ${\bf x}={\bf x}(t)$, we can obtain the following relations:

$$
\dot{\bf x}(t)={\bf v}(t)=\dot s{\bf t}\\
\ddot{\bf x}(t)={\bf a}(t)=\ddot s{\bf t}+{\dot s^2\over R}{\bf n}
$$
which implies for the curvature

$$
k(t)={1\over |{\bf v}(t)|^2}\left|{\bf a}(t)-{{\bf v}(t)\cdot{\bf a}(t)\over |{\bf v}(t)|^2}{\bf v}(t)\right|
$$

The circle tangent to the given curve, with radius equal to the radius of curvature and centre belonging to the half-plane containing the unit vector $\bf n$ is called the osculating circle.

**Theorem**: given curvature function of first-order derivative, there exists a unique plane regular curve.

The unit vector $\bf b=t\times n$ is called a binormal unit vector.

**Frenet Theorem**: Let $s\rightarrow {\bf x}(s)$ be a curve in ${\bf R}^3$ endowed with the natural parametrisation. Then the following equations hold:

$$
\begin{aligned}
{d{\bf t}\over ds}&=k(s){\bf n}(s)\\
{d{\bf n}\over ds}&=-k(s){\bf t}(s)-\chi(s){\bf b}(s)\\
{d{\bf b}\over ds}&=\chi(s){\bf n}(s)
\end{aligned}
$$
where $\chi(s)$ is called the torsion (or second curvature) of the curve.

**Theorem**: Given curvature and torsion function, there exists a unique curve.

## Vector field and integral curves
Let $U$ be an open subset of ${\bf R}^l$. A vector field $\bf X$ on $U$ is a regular function ${\bf X}: U\rightarrow {\bf R}^l$ associating with every point ${\bf x}\in U$ a vector $\bf X(x)$ of ${\bf R}^l$, which is said to be applied at the point $\bf x$.

Integral curves are the curves on which the derivative of any point is the associative vector field.

A vector field is called complete if for every point $\tt x$ the maximal integral curve passing through $\tt x$ is defined over all of $\bf R$.

## Surfaces

A point $(x_1,x_2,x_3)$ of the surface $F(x_1,x_2,x_3)=0$ is called non-singular if the gradient of $F$ computed at the point is non-vanishing. A surface $S$ whose points are all non-singular points is called regular.

By the implicit function theorem, if $P$ is non-singular, in a neighbourhood of $P$ the surface can be written as the graph of a function. For example, if $(\partial F/ \partial x_3)_P\neq 0$ there exists a regular function $f:U\rightarrow \bf R$ such that

$$
S=\text{graph}(f)=\{(x_1,x_2,x_3)\in{\bf R}^3 | (x_1,x_2)\in U, x_3=f(x_1,x_2)\}.
$$
In addition, from $F(x_1,x_2,x_3)=0$ it follows that $dF=0$.

It is an easy observation that at a non-singular point $\bold x_0$ there exists the tangent plane, whose equation is

$$
({\bf x-x_0})\cdot\nabla F=0
$$
More generally, it is possible to consider a parametric representation of the form ${\bf x}:U\rightarrow {\bf R}^3, {\bf x=x}(u,v)$.

If  the surface $S$ is given in parametric form, a point $P$ is called non-singular if

$$
\text{rank}\begin{pmatrix}
{\partial x_1\over\partial u} & {\partial x_2\over\partial u} & {\partial x_2\over\partial u}\\
{\partial x_1\over\partial v} & {\partial x_2\over\partial v} & {\partial x_2\over\partial v}
\end{pmatrix}_P=2
$$
This equation is equivalent to requiring that the vectors ${\bf x}_u,{\bf x}_v$ are linearly independent.

*In general, it is not possible to find a natural parametrisation that is globally non-singular for the whole of a regular surface*.

Consider a surface $S=F^{-1}(0)$, and a regular point $P\in S$. At such a point it is possible to define the *tangent space* $T_PS$ to the surface $S$ at the point $P$.

A vector $\bf w\in R^3$ at the point $P$ is said to be tangent to the surface $S$ at the point $P$ *if and only if there exists a curve ${\bf x}(t)$ on the surface passing through the point for some time $t_0$, ${\bf x}(t_0)=P$, with velocity $\dot {\bf x}(t_0)=\bf w$*.

The tangent vector at a point ${\bf x}(u_0,v_0)$ is

$$
\dot {\bf x}={\bf x}_u\dot u+{\bf x}_v\dot v
$$
$T_PS$ can be generated by the vector ${\bf x}_u,{\bf x}_v$.

A vector field $\bf X$ over a surface $S$ is a function assigning to every point $P$ of the surface, a vector ${\bf X}(P)\in \bf R^3$ applied at the point $P$. The field $X$ is called a **tangent field** if ${\bf X}(P)\in T_PS$ for every $P\in S$; the field is a **normal field** if ${\bf X}(P)\in {T_PS}^{\perp}$ for every point $P\in S$.

Since a vector field tangent to $S$ is expressed by ${\bf X}=X_1(u,v){\bf x}_u+X_2(u,v){\bf x}_v$ the equations of its integral curves are $\dot u=X_1(u,v),\dot v=X_2(u,v)$ and the curves lie on $S$.

Let $P$ be a non-singular point of the surface $F(x_0)=0$. Then the tangent space to the surface at $P$ coincides with the orthogonal space to the gradient of $F$ at $P$:

$$
T_PS=(\nabla F(P))^{\perp}
$$

A connecte surface $S$ is said to be oriented when a unitary normal vector field is uniquely assigned on the surface. The regular surfaces are always orientable.

For applications in mechanics, it is very important to be able to endow the surface with a distance or metric.

If $S=F^{-1}(0)$ is a regular surface, ${\bf x}={\bf x}(u,v)$ is a parametric representation for it, and $t\rightarrow (u(t),v(t)), t\in (a,b)$ is a curve on $S$, the length of the curve is given by

$$
l=\int^b_a \left|{d{\bf x}(u(t),v(t))\over dt}\right|dt=\int^b_a\sqrt{({\bf x}_u\dot u+{\bf x}_v\dot v)\cdot({\bf x}_u\dot u+{\bf x}_v\dot v)}dt
$$
If we define

$$
E(u,v)={\bf x}_u\cdot{\bf x}_u\\
F(u,v)={\bf x}_u\cdot{\bf x}_v\\
G(u,v)={\bf x}_v\cdot{\bf x}_v
$$
then

$$
l=\int^b_a\sqrt{E\dot u^2+2F\dot u\dot v+G\dot v^2}dt
$$
Setting $(ds)^2=d{\bf x}\cdot d{\bf x}$,

$$
(ds)^2=E(du)^2+2F(du)(dv)+G(dv)^2
$$
This is called the first fundamental form of the surface. This form fixed the metric on the surface. This expression represents a positive definite quadratic form: this means $E\gt 0$ and $EG-F^2\gt 0$. The area of the parallelogram whose sides are ${\bf x}_u,{\bf x}_v$ is exactly $\sqrt{EG-F^2}$.

Having defined the first fundamental form, it is possible to compute also the angle $\varphi$ between two intersecting curves

$$
\cos\varphi={{\bf w}_1\cdot{\bf w}_2\over |{\bf w}_1||{\bf w}_2|}
$$
where ${\bf w}_i$ is the velocity vectors of the two curves in the intersecting point.

If $F=0$, the parametrisation of a surface is called *orthogonal*. If in addition $E=G=g(u,v)$, and hence

$$
(ds)^2=g(u,v)((du)^2+(dv)^2)
$$
the parametrisation is called *conformal*, since the angle between the two curves on the surface is equal to the angle between two curves in the $(u,v)$ plane.

Given a regular surface, there always exist orthogonal as well as conformal coordinates.

The area of the part $S_D$ of the surface corresponding to the parameters $(u,v)$ varying within a bounded domain $D$ is

$$
\text{area}(S_D)=\int_D\sqrt{EG-F^2}dudv
$$

Theorem: **The first fundamental form is a covariant tensor of rank 2**.

Proof:

Let $(u',v')$ be a new parametrisation of the surface. From the identities

$$
du={\partial u\over\partial u'}du'+{\partial u\over\partial v'}dv'\\
dv={\partial v\over\partial u'}du'+{\partial v\over\partial v'}dv'
$$
it follows immediately that

$$
(ds)^2=(dudv)\begin{pmatrix}
E & F\\
F & G
\end{pmatrix}\begin{pmatrix} du \\ dv\end{pmatrix}
= (du'dv')J^T\begin{pmatrix}
E & F\\
F & G
\end{pmatrix}J\begin{pmatrix} du' \\ dv'\end{pmatrix}
$$
where

$$
\begin{pmatrix}
E' & F'\\
F' & G'
\end{pmatrix} = J^T\begin{pmatrix}
E & F\\
F & G
\end{pmatrix}J
$$

Among all the possible curves on a surface, the class of geodesics deserves special attention which indeed play a very important role in mechanics.

Let $S$ be a regular surface, and ${\bf x}(u,v)$ its parametric representation. Consider a curve on the surface parametrised with respect to the natrual parameter $s$. The unit vector $\bf t$ tangent to the curve is given by

$$
{\bf t}(s)={d{\bf x}\over ds}(s)=u'(s){\bf x}_u(u(s),v(s))+v'(s){\bf x}_v(u(s),v(s))\in T_{x(u(s),v(s))}S
$$
and the normal unit vector $\bf n$ is given by

$$
{\bf n}(s)={1\over k(s)}{d^2{\bf x}\over ds^2}={1\over k(s)}(u''{\bf x}_u+(u')^2{\bf x}_{uu}+2u'v'{\bf x}_{uv}+(v')^2{\bf x}_{vv}+v''{\bf x}_v)
$$
*The curve is called a geodesic if at every point of the curve the unit $\bf n$ normal to the curve belongs to the space normal to the surface, i.e. if*

$$
{\bf n}(s)\in (T_{x(u(s),v(s))}S)^{\perp}
$$
*for all $s$, and hence if and only if*

$$
{\bf n}(s)\cdot{\bf x}_u=0,\quad {\bf n}(s)\cdot{\bf x}_v=0
$$

Given a curve with an arbitrary parametrisation, denoting by $s=s(t)$ the time dependence, the condition for this curve to be a geodesic consists in this case of imposing the condition that **the acceleration be orthogonal to the surface**.

From the condition for geodesic curve, it is easy to derive a system of ordinary differential equations which the geodesics must satisfy:

$$
(u''{\bf x}_u + (u')^2{\bf x}_{uu} + 2u'v'{\bf x}_{uv} + (v')^2{\bf x}_{vv} + v''{\bf x}_u)\cdot {\bf x}_u=0,\\
(u''{\bf x}_u + (u')^2{\bf x}_{uu} + 2u'v'{\bf x}_{uv} + (v')^2{\bf x}_{vv} + v''{\bf x}_u)\cdot {\bf x}_v=0
$$
Note that

$$
\begin{aligned}
{\partial E\over\partial u}&=2{\bf x}_{uu}\cdot{\bf x}_u,\qquad\qquad {\partial E\over\partial v}=2{\bf x}_{uv}\cdot{\bf x}_u,\\

{\partial F\over\partial u}&={\bf x}_{uv}\cdot{\bf x}_u+{\bf x}_{uu}\cdot{\bf x}_v, {\partial F\over\partial v}={\bf x}_{uv}\cdot{\bf x}_v+{\bf x}_{vv}\cdot{\bf x}_u,\\

{\partial G\over\partial u}&=2{\bf x}_{uv}\cdot{\bf x}_v,\qquad\qquad {\partial G\over\partial v}=2{\bf x}_{vv}\cdot{\bf x}_v,
\end{aligned}
$$
hence the differential equations become

$$
Eu''+Fv''+{1\over 2}{\partial E\over\partial u}(u')^2+{\partial E\over\partial v}u'v'+\left({\partial F\over\partial v}-{1\over 2}{\partial G\over\partial u}\right)(v')^2=0\\
Fu''+Gv''+{1\over 2}{\partial G\over\partial v}(v')^2+{\partial G\over\partial u}u'v'+\left({\partial F\over\partial u}-{1\over 2}{\partial E\over\partial v}\right)(u')^2=0
$$
Denoting the matrix representing the first fundamental form by

$$
(g_{ij})=\begin{pmatrix}
E&F\\
F&G
\end{pmatrix},
$$
and its inverse by

$$
{g^{kl}}={1\over EG-F^2}\begin{pmatrix}
G&-F\\
-F&E
\end{pmatrix},
$$
and the so-called *Christoffel symbols*

$$
\Gamma^k_{ij}={1\over 2}\sum^2_{l=0}g^{kl}\left({\partial g_{lj}\over\partial u^i}+{\partial g_{il}\over\partial u^j}-{\partial g_{ij}\over\partial u^l}\right)
$$
where $u^1=u,u^2=v$. The system of differential equations for the geodesics can be written in the form

$$
{d^2u^k\over ds^2}+\sum^2_{i,j=1}\Gamma^k_{ij}{du^i\over ds}{du^j\over ds}=0,\quad k=1,2.
$$

For a surface of revolution with the parametrisation ${\bf x}=(u\cos v,u\sin v, f(u))$. The unit tangent vector for geodesic is ${\bf t}_g=u'(s){\bf x}_u+v'(s){\bf x}_v$, and the tangent for parallel is ${\bf x}_v$ with norm $u$, so

$$
{{\bf t}_g\cdot {\bf x}_v\over u}=uv'=\sin\alpha
$$
where $\alpha$ is the angle between the meridian and the geodesic at the intersection point. From the geodesic equations we can get

$$
u^2{dv\over ds}=c
$$
so

$$
u(s)\sin\alpha(s)=c.
$$
This is known as **Clairaut's theorem**. See also [@Needham2021, p. 121]

It is possible to prove that geodesics on a surface of revolution which are neither meridians nor closed curves are dense in the region $u\ge |c|$.

## Differentiable Riemannian manifolds

Let $A$ be an open connected subset of ${\bf R}^n$, and ${\bf f}:\rightarrow {\bf R}^{n-l}$ a map of class $\mathcal{C}^k$, $k\ge 2$. The zero level set $V=\set{{\bf x}\in A | {\bf f}({\bf x})=0}$ of $\bf f$, assumed non-empty, is called a regular submanifold of ${\bf R}^n$ of class $\mathcal{C}^k$ and of dimension $l$ if the Jacobian matrix of the map $\bf f$ is of maximal rank (hence if its rank is equal to $n-l$) at every point of $V$.

The tangent space $T_PV$ to a regular submanifold $V$ at the point $P$ is the $l$-dimensional vector space of the velocities $\dot{\bf x}(t_0)$ along the curves ${\bf x}(t)$ belonging to $V$ (hence such that ${\bf f}({\bf x}(t))=0$ for every $t$) and passing through $P$ for $t=t_0$.

$T_PV$ coincides with the vector space generated by the vectors which are orthogonal to the gradients $\nabla_{\bf x}f_1(P),\ldots,\nabla_{\bf x}f_{n-l}(P)$. The latter will be called a basis of the *normal space* to $V$ in $P$.

Definition: A differentiable manifold of dimension $l$ and class $\mathcal{C}^k$ *consists of a non-empty set $M$ and a family of injective maps ${\bf x}_{\alpha}: U_{\alpha}\subset {\bf R}^l\rightarrow M$, with $U_{\alpha}$ open and connected and $\alpha\in\mathcal{A}\neq\emptyset$ such that:*

- $\displaystyle\bigcup_{\alpha\in A}{\bf x}_{\alpha} (U_{\alpha})=M$;
- for any $\alpha$ and $\beta$ in $\mathcal{A}$, if ${\bf x}_{\alpha}(U_{\alpha})\cap{\bf x}_{\beta}(U_{\beta})=W\neq\emptyset$ the sets ${\bf x}_{\alpha}^{-1}(W)$ and ${\bf x}_{\beta}^{-1}(W)$ are open subset of ${\bf R}^l$ and the maps ${\bf x}^{-1}_{\beta}\circ{\bf x}_{\alpha}$ and ${\bf x}^{-1}_{\alpha}\circ{\bf x}_{\beta}$ (inverses of each other) are differentiable maps of class $\mathcal{C}^k$.

The pair $(U_{\alpha},{\bf x}_{\alpha})$ is called a local parametrisation or a **chart** of $M$, while a family $\{(U_{\alpha},{\bf x}_{\alpha})\}_{\alpha\in A}$ with properties listed in the definition is called a **differentiable structure** on $M$ or an **atlas** of $M$.

Theorem: *Every regular $l$-dimensional submanifold $V$ of ${\bf R}^n$ is a differentiable manifold*.

Definition: A differentiable manifold $M$ is *orientable* if it admits a differentiable structure $\{(U_{\alpha},{\bf x}_{\alpha})\}_{\alpha\in A}$ such that for every pair $\alpha,\beta\in\mathcal{A}$ with ${\bf x}_{\alpha}(U_{\alpha})\cap{\bf x}_{\beta}(U_{\beta})\neq\emptyset$ the Jacobian of the change of coordinates ${\bf x}^{-1}_{\alpha}\circ{\bf x}_{\beta}$ is positive. Otherwise the manifold is called *non-orientable*.

Definition: Let $M_1$ and $M_2$ be two differentiable manifolds of dimension $l$ and $m$ respectively. A map $g: M_1\rightarrow M_2$ is differentiable at a point $p\in M_1$ if given an arbitrary parametrisation ${\bf y}: V\subset {\bf R}^m\rightarrow M_2$ with ${\bf y}(V)\ni g(p)$, there exists a parametrisation ${\bf x}: U\subset {\bf R}^l\rightarrow M_1$ with ${\bf x}(U)\ni p$ such that $g({\bf x}(U))\subset {\bf y}(V)$ and the function ${\bf y}^{-1}\circ g\circ {\bf x}: U\subset {\bf R}^l\rightarrow V\subset {\bf R}^m$ is differentiable in ${\bf x}^{-1}(p)$. The map $g$ is differentiable in an open subset of $M_1$ if it is differentiable at every point of the subset.

Definition: A curve on a manifold $M$ is a differentiable map $\gamma : (a,b)\rightarrow M$.

If $(U,\bf x)$ is local parametrisation of $M$ in a neighbourhood of a point $p={\bf x}(0)$, we can express a curve $\gamma$ using the parametrisation

$$
({\bf x}^{-1}\circ \gamma)(t)=(u_1(t),\ldots,u_l(t))\in U.
$$

Definition: The tangent space $T_pM$ to a differentiable manifold $M$ at a point $p$ is *the space of vectors tangent to the curves on $M$ passing through $p$*.

Definition: Let $g:M_1\rightarrow M_2$ be a differentiable map between the differentiable manifolds $M_1,M_2$ of dimension $l,m$ respectively. The linear map which with every ${\bf v}\in T_pM_1$, defined by ${\bf v}=\dot\gamma(0)$, associates ${\bf w}\in T_{g(p)}M_2$, defined by ${\bf w}=\dot\beta(0)$, with $\beta=g\circ\gamma$, is  the differential $dg_p:T_pM_1\rightarrow T_{g(p)}M_2$.

e.g. $\dot w_i(0)=\sum^l_{j=1}{\partial f_i\over\partial v_j}\dot v_j(0)$.

Definition: Let $M_1$ and $M_2$ be two differentiable manifolds, both of dimension $l$. A map $g: M_1\rightarrow M_2$ is **diffeomorphism** if it is defferentiable, bijective and its inverse $g^{-1}$ is differentiable; $g$ is a **local diffeomorphsim** at $p\in M_1$ if there exist two neighbourhoods, $A$ of $p$ and $B$ of $g(p)$, such that $g:A\rightarrow B$ is a diffeomorphism.

Theorem: Let $g:M_1\rightarrow M_2$ be a differentiable map, and let $p\in M_1$ be such that $dg_p: T_pM_1\rightarrow T_{g(p)}M_2$ is an isomorphism. Then $g$ is a local diffeomorphism.

Definition: We call the tangent bundle of $M$, denoted by $TM$, the *differentiable manifold of dimension $2l$*:

$$
TM=\bigcup_{p\in M}\{p\}\times T_pM
$$
with the differentiable structure $\{(U_{\alpha}\times{\bf R}^l,{\bf y}_{\alpha})\}_{\alpha\in A}$, where ${\bf y}_{\alpha}({\bf u}^{(\alpha)},{\bf v}^{(\alpha)})=({\bf x}_{\alpha}({\bf u}^{(\alpha)}),{\bf v}^{(\alpha)})$, with ${\bf u}^{(\alpha)}\in U_{\alpha}$ being the vector of local coordinates in $U_{\alpha}$ and ${\bf v}^{(\alpha)}$ is a vector in the tangent space at a point ${\bf x}_{\alpha}({\bf u}^{(\alpha)})$. The manifold $M$ is called the base space of the tangent bundle.

The map $\pi:TM\rightarrow M$ which associates with every point $(p,{\bf v})\in TM$ the point $p$ itself is called the projection onto the base. Clearly $T_pM=\pi^{-1}(p)$ and $T_pM$ is also called the fibre corresponding to the point $p$ of the tangent bundle. 

The notion of a tangent bundle of a manifold is important as it allows one to extend to manifolds the notions of a vector field and a differential equation.

Definition: A (tangent) vector field on $M$ is a map $X: M\rightarrow TM$ which associates with every point $p\in M$ a vector ${\bf v}_p \in T_pM$ in a differentiable way, i.e. it is a differentiable map $X$ such that $\pi(X(p))=p,\forall p\in M$.

For a given vector field, the integral curves are the curves $\gamma:(a,b)\rightarrow M$ such that $\dot\gamma(t)=X(\gamma(t))$. If $X$ is given in the form

$$
X(p)=\sum^l_{i=1}\alpha_i(u_1,\ldots,u_l){\partial {\bf x}\over\partial u_i},
$$
with $p=\bf x(u)$, then equation for $\dot\gamma$ is simply

$$
\dot u_i(t)=\alpha_i(u_1(t),\ldots,u_l(t)),\quad i=1,\ldots,l.
$$

Definition: A Riemannian metric on a differentiable manifold $M$ of dimension $l$ is a symmetric, positive definite bilinear form $(,)_p$ defined in the tangent space $T_pM$, which has differentiable dependence on $p$. A differentiable manifold with a given Riemannian metric is called a *Riemannian manifold*.

Let ${\bf x}:U\rightarrow M$ be local parametrisation in $p\in M$ with local coordinates $(u_1,\ldots, u_l)$. We saw that at every point $q\in {\bf x}(U),\,q={\bf x}(u_1,\ldots,u_l)$, the vectors

$$
e_i(q)={\partial\over\partial u_i}\biggm\vert_q,\quad i=1,\ldots,l,
$$
are a basis for $T_qM$. If $(,)_p$ is a Riemannian metric on $M$ the functions

$$
g_{ij}(u_1,\ldots,u_l)=(e_i(q),e_j(q))_q
$$
are differentiable in $U$ for every $i,j=1,\ldots,l$. Evidently $g_{ij}=g_{ji}$ and if $(u'_1,\ldots,u'_l)$ is a new local parametrisation, compatible with the former one, setting $g'_{ij}=(e'_i(q),e'_j(q))_q$ we have

$$
g'_{ij}=\sum^l_{m,n=1}J_{mi}g_{mn}J_{nj},
$$
where $J_{mi}=\partial u_m/\partial u'_i$. Hence a Riemannian metric defines a *symmetric covariant tensor of order 2* on the manifold. We can write

$$
(ds)^2=\sum^l_{i,j=1}g_{ij}{\rm d} u_i {\rm d} u_j.
$$

Definition: Let $M$ and $N$ be two Riemannian manifolds. A diffeomorphism $g:M\rightarrow N$ is an *isometry* if

$$
({\bf v}_1,{\bf v}_2)_p=({\rm d}g_p({\bf v}_1),{\rm d}g_p({\bf v}_2))_{g(p)}
$$
for every $p\in M$ and ${\bf v}_1,{\bf v}_2\in T_pM$. If $N=M$, $g$ is called an *isometry* of $M$.

Definition: Given a local parametrisation $(u_1,\dotsc,u_l)$ of $M$, and denoting by $s$ the natural parameter along the curve, a geodesic $s\rightarrow (u_1(s),\dotsc,u_l(s))$ is a solution of the system of equations

$$
{{\rm d}^2u_k\over{\rm d}s^2}+\sum^l_{i,j=1}\Gamma^k_{ij}{{\rm d}u_i\over{\rm d}s}{{\rm d}u_j\over{\rm d}s}=0,\quad k=1,\dotsc,l,
$$
where the Christoffel symbols $\Gamma^k_{ij}$ are given by

$$
\Gamma^k_{ij}={1\over 2}\sum^l_{n=1}g^{kn}\left({\partial g_{ni}\over\partial u_j}+{\partial g_{nj}\over\partial u_i}-{\partial g_{ij}\over\partial u_n}\right)
$$
and $(g^{kn})$ is the matrix inverse to $(g_{ij})$.

Geodesics are invariant under any isometry of a Riemannian manifold.

## Actions of groups and tori

Definition: A group $G$ acts (to the left) on a differentiable manifold $\widetilde M$ if there exists a map $\varphi: G\times \widetilde M\rightarrow\widetilde M$ such that:
- for every $g\in G$ the map $\varphi_g:\widetilde M\rightarrow\widetilde M,\varphi_g(p)=\varphi(g,p)$, where $p\in\widetilde M$, is a diffeomorphism;
- if $e$ denotes the unit element in $G$, $\varphi_e=identity$;
- for any choice of $g_1,g_2\in G,\varphi_{g_1g_2}=\varphi_{g_1}\varphi_{g_2}$.

The action of $G$ on $\widetilde M$ is free if for every $p\in\widetilde M$ the unit element $e\in G$ is the only element of $G$ such that $\varphi_e(p)=p$. The action is discontinuous if every point $p\in\widetilde M$ has a neighbourhood $A\subset\widetilde M$ such that $A\cap\varphi_g(A)=\emptyset$ for every $g\in G, g\neq e$.

Definition: Two point $p_1,p_2\in\widetilde M$ are equivalent (denoted $p_1\sim p_2$) if and only if there exists an element $g\in G$ such that $p_2=\varphi_g(p_1)$.

Two points of the manifold are equivalent if they belong to the same *orbit* $Gp=\set{\varphi_g(p)|g\in G}$. The orbits of the points of $\widetilde M$ under the action of the group $G$ are the equivalence classes $[p]=Gp=\set{p'\in\widetilde M|p'\sim p}$.

The *quotient space* $\widetilde M/G=\set{[p]|p\in\widetilde M}$ with respect to the equivalence relation introduced, is a topological space, with the topology induced by the requirement that the *projection*

$$
\pi:\widetilde M\rightarrow\widetilde M/G,\quad \pi(p)=[p]
$$
is continuous and open (hence the open subsets of $\widetilde M/G$ are the projections of the open subsets of $\widetilde M$).

Theorem: Let $\widetilde M$ be a differentiable manifold and let $\varphi: G\times\widetilde M\rightarrow\widetilde M$ be the free discontinous action of group $G$ on $\widetilde M$. The quotient $M=\widetilde M/G$ is a differentiable manifold and the projection $\pi:\widetilde M\rightarrow M$ is a local diffeomorphism.