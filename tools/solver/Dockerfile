# TexasSolver console solver, pinned and reproducible.
#
# NOTE THE BRANCH. `master` is the Qt GUI project — it has no CMakeLists.txt,
# builds a GUI binary, and that binary sits in an event loop when run headless.
# The console solver lives on the `console` branch, which is a plain CMake
# project. Getting this wrong costs an afternoon; it is why the branch is
# named in the clone rather than left to a default.
#
# The commit is NOT hardcoded as a hash here, because a hash written by hand is
# a hash nobody verified. The build records whatever it actually cloned into
# /solver-commit.txt, and the runner reads that file into the manifest.
#
#   docker build --build-arg TEXASSOLVER_REF=console \
#     -t suitedpoker/texassolver:pinned tools/solver

FROM ubuntu:22.04 AS build

ARG TEXASSOLVER_REF=console
ARG DEBIAN_FRONTEND=noninteractive

# python3-dev is not optional: the console branch's CMake pulls in pybind11,
# which fails configure without Python headers even though we never use the
# Python bindings.
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential cmake git ca-certificates python3 python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone -b "${TEXASSOLVER_REF}" https://github.com/bupticybee/TexasSolver.git . \
 && git rev-parse HEAD > /solver-commit.txt

RUN mkdir -p build && cd build && cmake .. && make install -j "$(nproc)"

FROM ubuntu:22.04

RUN apt-get update && apt-get install -y --no-install-recommends \
      libstdc++6 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# The solver resolves its resources (the hand-rank dictionaries) relative to
# its own directory, so the install tree is kept intact and used as the cwd.
COPY --from=build /src/install /opt/solver
COPY --from=build /solver-commit.txt /solver-commit.txt

WORKDIR /opt/solver
ENTRYPOINT []
CMD ["./console_solver"]
