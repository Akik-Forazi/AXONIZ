#!/bin/bash
# Axodex CLI tool wrappers for SWE-bench evaluation
#
# These functions call the Axodex eval-server (HTTP daemon) for near-instant
# tool responses. The eval-server keeps KuzuDB warm in memory.
#
# If the eval-server is not running, falls back to direct CLI commands.
#
# Usage:
#   axodex-query "how does authentication work"
#   axodex-context "validateUser"
#   axodex-impact "AuthService" upstream
#   axodex-cypher "MATCH (n:Function) RETURN n.name LIMIT 10"
#   axodex-overview

AXODEX_EVAL_PORT="${AXODEX_EVAL_PORT:-4848}"
AXODEX_EVAL_URL="http://127.0.0.1:${AXODEX_EVAL_PORT}"

_axodex_call() {
    local tool="$1"
    shift
    local json_body="$1"

    # Try eval-server first (fastest path — KuzuDB stays warm)
    local result
    result=$(curl -sf -X POST "${AXODEX_EVAL_URL}/tool/${tool}" \
        -H "Content-Type: application/json" \
        -d "${json_body}" 2>/dev/null)

    if [ $? -eq 0 ] && [ -n "$result" ]; then
        echo "$result"
        return 0
    fi

    # Fallback: direct CLI (cold start, slower but always works)
    case "$tool" in
        query)
            local q=$(echo "$json_body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('query',''))" 2>/dev/null)
            npx axodex query "$q" 2>&1
            ;;
        context)
            local n=$(echo "$json_body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('name',''))" 2>/dev/null)
            npx axodex context "$n" 2>&1
            ;;
        impact)
            local t=$(echo "$json_body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('target',''))" 2>/dev/null)
            local d=$(echo "$json_body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('direction','upstream'))" 2>/dev/null)
            npx axodex impact "$t" --direction "$d" 2>&1
            ;;
        cypher)
            local cq=$(echo "$json_body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('query',''))" 2>/dev/null)
            npx axodex cypher "$cq" 2>&1
            ;;
        *)
            echo "Unknown tool: $tool" >&2
            return 1
            ;;
    esac
}

axodex-query() {
    local query="$1"
    local task_context="${2:-}"
    local goal="${3:-}"

    if [ -z "$query" ]; then
        echo "Usage: axodex-query <query> [task_context] [goal]"
        echo "Search the code knowledge graph for execution flows related to a concept."
        echo ""
        echo "Examples:"
        echo '  axodex-query "authentication flow"'
        echo '  axodex-query "database connection" "fixing connection pool leak"'
        return 1
    fi

    local args="{\"query\": \"$query\""
    [ -n "$task_context" ] && args="$args, \"task_context\": \"$task_context\""
    [ -n "$goal" ] && args="$args, \"goal\": \"$goal\""
    args="$args}"

    _axodex_call query "$args"
}

axodex-context() {
    local name="$1"
    local file_path="${2:-}"

    if [ -z "$name" ]; then
        echo "Usage: axodex-context <symbol_name> [file_path]"
        echo "Get a 360-degree view of a code symbol: callers, callees, processes, file location."
        echo ""
        echo "Examples:"
        echo '  axodex-context "validateUser"'
        echo '  axodex-context "AuthService" "src/auth/service.py"'
        return 1
    fi

    local args="{\"name\": \"$name\""
    [ -n "$file_path" ] && args="$args, \"file_path\": \"$file_path\""
    args="$args}"

    _axodex_call context "$args"
}

axodex-impact() {
    local target="$1"
    local direction="${2:-upstream}"

    if [ -z "$target" ]; then
        echo "Usage: axodex-impact <symbol_name> [upstream|downstream]"
        echo "Analyze the blast radius of changing a code symbol."
        echo ""
        echo "  upstream  = what depends on this (what breaks if you change it)"
        echo "  downstream = what this depends on (what it uses)"
        echo ""
        echo "Examples:"
        echo '  axodex-impact "AuthService" upstream'
        echo '  axodex-impact "validateUser" downstream'
        return 1
    fi

    _axodex_call impact "{\"target\": \"$target\", \"direction\": \"$direction\"}"
}

axodex-cypher() {
    local query="$1"

    if [ -z "$query" ]; then
        echo "Usage: axodex-cypher <cypher_query>"
        echo "Execute a raw Cypher query against the code knowledge graph."
        echo ""
        echo "Schema: Nodes: File, Function, Class, Method, Interface, Community, Process"
        echo "Edges via CodeRelation.type: CALLS, IMPORTS, EXTENDS, IMPLEMENTS, DEFINES, MEMBER_OF, STEP_IN_PROCESS"
        echo ""
        echo "Examples:"
        echo "  axodex-cypher 'MATCH (a)-[:CodeRelation {type: \"CALLS\"}]->(b:Function {name: \"save\"}) RETURN a.name, a.filePath'"
        echo "  axodex-cypher 'MATCH (n:Class) RETURN n.name, n.filePath LIMIT 20'"
        return 1
    fi

    _axodex_call cypher "{\"query\": \"$query\"}"
}

axodex-overview() {
    echo "=== Code Knowledge Graph Overview ==="
    _axodex_call list_repos '{}'
}

# Export functions so they're available in subshells
export -f _axodex_call 2>/dev/null
export -f axodex-query 2>/dev/null
export -f axodex-context 2>/dev/null
export -f axodex-impact 2>/dev/null
export -f axodex-cypher 2>/dev/null
export -f axodex-overview 2>/dev/null
