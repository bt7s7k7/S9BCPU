export const EXAMPLES = [
    {
        label: "Loop",
        code: `
    a = 5
    b = a
loop:
    ?b pc = :loopEnd
    -b
    out = sub
    pc = :loop
loopEnd:
    !done
        `
    }, {
        label: "Fibonacci",
        code: `
    #define CALL ADDRESS { 
        #push
        push = :return_point
        pc = ADDRESS
    return_point:
        !pop
        #pop
    }
    
    #define RETURN {
        pc = stack 0
    }
    
// --- MAIN ---
    push = 6
    CALL(:fib)
    out = stack 0
    !done
    
fib:
    #push
    a = stack 1
    // Check if argument is zero
    ?!a pc = :notZero
    // If zero return it
    RETURN
notZero:
    // Check if argument is one
    -a
    ?!a pc = :notOne
    // If one then return one
    RETURN
notOne:
    push = a // 0:arg0-1 1:ret
    push = a // 0:fib(arg0-1) 1:arg0-1 2:ret
    CALL(:fib)
    a = stack 1 // a = arg0-1
    -a // a = arg0-2
    push = a // 0:fib(arg0-2) 1:fib(arg0-1) 2:arg0-1 3:ret
    CALL(:fib) // s-1 = Fib (arg0 - 2)
    a = stack 0 
    b = stack 1
    stack 4 = sum // Return value = s-2 + s-1
    !pop // Pop local variables
    !pop
    !pop
    RETURN
    #pop
    `
    }
] as {label: string, code: string}[]